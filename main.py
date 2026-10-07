"""
main.py — Entry point and pipeline orchestrator for AI Job Tracker.

Pipeline:
  1. Check daily sync quota (enforces DAILY_SYNC_LIMIT)
  2. Authenticate Gmail
  3. Fetch latest emails (skip already-processed ones)
  4. For each new email:
     a. Job-email pre-filter
     b. AI-classify (OpenAI -> Gemini -> keyword fallback)
     c. Upsert into Notion (create or update)
     d. Send Telegram alert if status is noteworthy
  5. Mark emails as processed (persist to data/processed_emails.json)
  6. Print / log summary stats

Usage:
    python main.py                   # run once (respects daily limit)
    python main.py --days 7          # scan emails from last 7 days
    python main.py --force           # bypass daily sync limit
"""
import sys
import json
import logging
from pathlib import Path

# Fix Windows console encoding so Unicode characters print correctly
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import config
from config import setup_logging, print_startup_diagnostics
from sync_quota import can_sync, record_sync, get_quota

# Initialise logging first so all imports use correct level
logger = setup_logging("main")
PIPELINE_STATUS_FILE = config.DATA_DIR / "pipeline_status.json"

def _update_pipeline_status(data: dict) -> None:
    """Save pipeline execution status for Next.js web app / API polling."""
    try:
        PIPELINE_STATUS_FILE.parent.mkdir(exist_ok=True)
        with open(PIPELINE_STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.warning("Failed to write pipeline status file: %s", e)


def run_once(days: str | None = None, force: bool = False) -> dict:
    """
    Execute one full scan-classify-upsert cycle.
    Returns a stats dict: {fetched, new, processed, created, updated, skipped, errors}
    """
    import os
    import time
    from datetime import datetime, timezone
    from gmail_reader import get_gmail_service, fetch_messages
    from status_classifier import classify_email_ai, reset_gemini_session, _extract_company, _extract_role
    from db_manager import upsert_application
    from telegram_notifier import notify_status_change, notify_summary
    from utils import is_job_related
    from email_history import get_processed_ids, mark_processed

    # Check daily sync quota
    allowed, quota = can_sync()
    if not allowed and not force:
        logger.warning(
            "Daily Gmail sync limit reached (%d/%d used today). Resets at %s. Use --force to override.",
            quota["syncs_today"], quota["daily_limit"], quota.get("resets_at", "00:00 UTC")
        )
        _update_pipeline_status({
            "is_running": False,
            "status": "limit_reached",
            "last_run_time": datetime.now(timezone.utc).isoformat(),
            "error": f"Daily sync limit reached ({quota['syncs_today']}/{quota['daily_limit']}). Resets at {quota.get('resets_at', '00:00 UTC')}.",
            "quota": quota,
        })
        return {"status": "limit_reached", "quota": quota}

    # Record quota usage for this sync run
    quota = record_sync()

    # Apply days filter if provided via parameter or environment
    effective_days = days or os.environ.get("GMAIL_DAYS", "").strip()
    if effective_days and effective_days.lower() != "all":
        config.GMAIL_QUERY = f"{config._base_query} newer_than:{effective_days}d"
        logger.info("Applying time horizon query: newer_than:%sd", effective_days)

    stats = {
        "fetched": 0, "new": 0, "processed": 0,
        "created": 0, "updated": 0, "skipped": 0, "errors": 0,
    }

    start_ts = time.time()
    reset_gemini_session()

    _update_pipeline_status({
        "is_running": True,
        "status": "running",
        "start_time": datetime.now(timezone.utc).isoformat(),
        "days_filter": effective_days or "ALL",
        "quota": quota,
        "stats": stats,
    })

    # â”€â”€ Startup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    print_startup_diagnostics()
    logger.info("=" * 60)
    logger.info("AI Job Tracker â€” starting pipeline run")
    logger.info("=" * 60)

    # â”€â”€ Step 1: Gmail authentication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try:
        service = get_gmail_service()
    except Exception as exc:
        logger.error("Gmail authentication failed: %s", exc)
        logger.error("Ensure credentials.json is present and valid.")
        _update_pipeline_status({
            "is_running": False,
            "status": "error",
            "last_run_time": datetime.now(timezone.utc).isoformat(),
            "error": f"Gmail auth failed: {exc}",
            "stats": stats,
        })
        return stats

    # â”€â”€ Step 2: Fetch emails â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try:
        emails = fetch_messages(service, max_results=config.GMAIL_MAX_RESULTS)
    except Exception as exc:
        logger.error("Failed to fetch Gmail messages: %s", exc)
        _update_pipeline_status({
            "is_running": False,
            "status": "error",
            "last_run_time": datetime.now(timezone.utc).isoformat(),
            "error": f"Gmail fetch failed: {exc}",
            "stats": stats,
        })
        return stats

    stats["fetched"] = len(emails)
    if not emails:
        logger.info("No emails fetched from Gmail.")
        _update_pipeline_status({
            "is_running": False,
            "status": "idle",
            "last_run_time": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": round(time.time() - start_ts, 2),
            "stats": stats,
        })
        return stats

    # â”€â”€ Step 3: Filter already-processed emails â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    processed_ids = get_processed_ids()
    new_emails = [e for e in emails if e.get("id") not in processed_ids]
    stats["new"] = len(new_emails)

    logger.info(
        "Fetched %d emails | %d already processed | %d new to check",
        stats["fetched"], len(emails) - len(new_emails), stats["new"],
    )

    if not new_emails:
        logger.info("All emails already processed â€” nothing to do.")
        _update_pipeline_status({
            "is_running": False,
            "status": "idle",
            "last_run_time": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": round(time.time() - start_ts, 2),
            "stats": stats,
        })
        return stats

    # Database Engine Availability (Supabase or SQLite fallback)
    db_available = True

    newly_processed_ids = []

    # â”€â”€ Step 4: Per-email pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for email in new_emails:
        subject  = email.get("subject", "")
        sender   = email.get("sender", "")
        body     = email.get("body", "")
        gmail_id = email.get("id", "")

        stats["processed"] += 1

        # Pre-filter non-job emails
        if not is_job_related(subject, body, sender):
            stats["skipped"] += 1
            newly_processed_ids.append(gmail_id)  # mark so we don't check again
            continue

        # a) Classify
        try:
            classification = classify_email_ai(email)
        except Exception as exc:
            logger.error("Classification error for [%s]: %s", subject[:50], exc)
            stats["errors"] += 1
            # Do NOT mark as processed on unexpected exceptions so it can retry later
            continue

        # b) Validation Layer with Smart Fallbacks
        company = classification.get("company") or "Unknown"
        role = classification.get("role") or "Unknown"
        status = classification.get("status") or "Unknown"

        # Fallback 1: Extract company if unknown
        if company == "Unknown":
            extracted_comp = _extract_company(sender, subject, body)
            if extracted_comp and extracted_comp != "Unknown":
                company = extracted_comp
                classification["company"] = company

        # Fallback 2: Extract role if unknown
        if role == "Unknown":
            extracted_role = _extract_role(subject, body)
            if extracted_role and extracted_role != "Unknown":
                role = extracted_role
                classification["role"] = role
            else:
                role = "Candidate / Intern"
                classification["role"] = role

        # Fallback 3: Status preservation (if high likelihood job email, mark as Needs Review)
        if status == "Unknown":
            if is_job_related(subject, body, sender) and company != "Unknown":
                status = "Needs Review"
                classification["status"] = "Needs Review"
            else:
                logger.info("  -> Skipping insertion: status remains Unknown for [%s]", subject[:50])
                stats["skipped"] += 1
                newly_processed_ids.append(gmail_id)
                continue

        if company == "Unknown":
            logger.info("  -> Skipping insertion: company remains Unknown for [%s]", subject[:50])
            stats["skipped"] += 1
            newly_processed_ids.append(gmail_id)
            continue

        logger.info(
            "  [%s] -> %s @ %s (status=%s)",
            subject[:50],
            classification.get("role", "?"),
            classification.get("company", "?"),
            classification.get("status"),
        )

        # AI Company Research & Scam Check
        from company_researcher import analyze_company
        analysis = analyze_company(company, role, status)
        classification["scam_risk"] = analysis["scam_risk"]
        classification["risk_notes"] = analysis["risk_notes"]
        classification["prep_sheet"] = analysis["prep_sheet"]
            
        # c) Handle "Job Opportunity" digests specifically
        if status == "Job Opportunity":
            from utils import make_email_id
            from email_history import is_processed, mark_processed
            
            opportunity_id = f"opp_{make_email_id('opportunity', company, role)}"
            
            if is_processed(opportunity_id):
                logger.info("  -> Job Opportunity already notified recently: %s at %s. Skipping.", role, company)
            else:
                logger.info("  -> Found a new Job Opportunity: %s at %s. Sending Telegram alert but skipping Notion.", role, company)
                try:
                    notify_status_change(email, classification, action="opportunity")
                    mark_processed([opportunity_id])
                except Exception as e:
                    logger.error("Failed to send Job Opportunity Telegram alert: %s", e)
            
            stats["skipped"] += 1
            newly_processed_ids.append(gmail_id)
            continue
            
        # d) Database upsert (Supabase or SQLite)
        if db_available:
            try:
                result = upsert_application(email, classification)
                action = result.get("action", "skipped")
                status_changed = result.get("status_changed", False)

                if action == "created":
                    stats["created"] += 1
                elif action == "updated":
                    stats["updated"] += 1
                else:
                    stats["skipped"] += 1

                # e) Notifications (for actual applications or status changes)
                if status_changed and action in ("created", "updated"):
                    try:
                        notify_status_change(email, classification, action)
                    except Exception as exc:
                        logger.warning("Telegram notify failed: %s", exc)

                newly_processed_ids.append(gmail_id)

            except Exception as exc:
                logger.error("Notion upsert error for [%s]: %s", subject[:50], exc)
                stats["errors"] += 1
        else:
            logger.info(
                "    (Notion not configured â€” classification only: %s)",
                json.dumps(classification, indent=None),
            )
            stats["skipped"] += 1
            newly_processed_ids.append(gmail_id)

    # â”€â”€ Step 5: Persist processed IDs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if newly_processed_ids:
        mark_processed(newly_processed_ids)
        logger.info("Marked %d emails as processed.", len(newly_processed_ids))

    # â”€â”€ Step 6: Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    logger.info("-" * 60)
    logger.info(
        "Run complete | fetched=%d new=%d processed=%d "
        "created=%d updated=%d skipped=%d errors=%d",
        stats["fetched"], stats["new"], stats["processed"],
        stats["created"], stats["updated"], stats["skipped"], stats["errors"],
    )

    try:
        notify_summary(stats)
    except Exception:
        pass

    duration_sec = round(time.time() - start_ts, 2)
    _update_pipeline_status({
        "is_running": False,
        "status": "idle",
        "last_run_time": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": duration_sec,
        "quota": get_quota(),
        "stats": stats,
    })

    return stats


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AI Job Tracker - Gmail Scanner & Notion Synchronizer")
    parser.add_argument("--days", "-d", type=str, default=None, help="Scan emails newer than N days (e.g. 7, 14, 30)")
    parser.add_argument("--force", "-f", action="store_true", help="Bypass daily Gmail sync limit")
    args = parser.parse_args()
    run_once(days=args.days, force=args.force)


