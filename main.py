"""
main.py — Pipeline orchestrator for InternPulse.

One sync:
  1. Check the daily sync limit and that no other sync is running
  2. List matching Gmail message IDs, and skip the ones already handled
  3. For each new email, oldest first so the latest email decides the status:
     a. Relevance filter
     b. Classify (Gemini, then keyword fallback), validate, fill gaps
     c. Job digests: save the opportunity and alert once
     d. Applications: research the company, upsert, alert if the status changed
  4. Record the run

Usage:
    python main.py                 # one sync (respects the daily limit)
    python main.py --days 7        # only emails from the last 7 days
    python main.py --force         # bypass the daily limit
    python main.py --dry-run --limit 5   # classify only: no writes, no alerts
"""
import argparse
import json
import sys
import time
from collections import Counter
from datetime import datetime, timezone

# Fix Windows console encoding so Unicode characters print correctly
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import cloud_state
import company_researcher
import config
import db_manager
import email_history
import gmail_reader
import status_classifier
import telegram_notifier
from config import setup_logging, print_startup_diagnostics
from sync_quota import can_sync, record_sync, get_quota
from utils import is_job_related, make_email_id

logger = setup_logging("main")
PIPELINE_STATUS_FILE = config.DATA_DIR / "pipeline_status.json"

_RISK_RANK = {"High": 3, "Medium": 2, "Low": 1}


def _risk_rank(risk: str | None) -> int:
    return _RISK_RANK.get(risk or "", 0)


def _update_pipeline_status(data: dict) -> None:
    """Save run status for the local dashboard's polling."""
    try:
        PIPELINE_STATUS_FILE.parent.mkdir(exist_ok=True)
        with open(PIPELINE_STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.warning("Failed to write pipeline status file: %s", e)


def _finish(run_id: str | None, status: str, stats: dict, started: float, error: str | None = None) -> None:
    if run_id:
        cloud_state.finish_run(run_id, status, stats, error)
    _update_pipeline_status({
        "is_running": False,
        "status": "error" if status == "error" else "idle",
        "last_run_time": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": round(time.time() - started, 2),
        "error": error,
        "stats": stats,
        "quota": get_quota(),
    })


def _fill_gaps(classification: dict, email: dict) -> tuple[bool, bool]:
    """
    Validate a classification and fill missing fields with the regex extractors.
    Returns (keep, resolved): keep=False means don't store it; resolved=False means
    the fallback tier gave up and a later run (with Gemini) may do better.
    """
    subject, body, sender = email.get("subject", ""), email.get("body", ""), email.get("sender", "")
    company = classification.get("company") or "Unknown"
    role = classification.get("role") or "Unknown"
    status = classification.get("status") or "Unknown"

    if company == "Unknown":
        company = status_classifier._extract_company(sender, subject, body)
        classification["company"] = company
    if role == "Unknown":
        classification["role"] = status_classifier._extract_role(subject, body)
    if status == "Unknown" and company != "Unknown" and is_job_related(subject, body, sender):
        status = "Needs Review"
        classification["status"] = status

    keep = company != "Unknown" and status != "Unknown"
    retry_later = classification.get("method") == "keyword" and status_classifier.is_gemini_configured()
    return keep, keep or not retry_later


def _handle_opportunity(email: dict, classification: dict) -> None:
    """Job digests aren't applications: store them on the Radar and alert once."""
    if cloud_state.available():
        is_new = cloud_state.save_opportunity(classification)
    else:
        opportunity_id = f"opp_{make_email_id('opportunity', classification['company'], classification['role'])}"
        is_new = not email_history.is_processed(opportunity_id)
        if is_new:
            email_history.mark_processed([opportunity_id])
    if is_new:
        try:
            telegram_notifier.notify_status_change(email, classification, action="opportunity")
        except Exception as exc:
            logger.warning("Telegram notify failed: %s", exc)


def _process_email(email: dict, stats: dict, handled: list, outcomes: Counter, dry_run: bool) -> None:
    subject, body, sender = email.get("subject", ""), email.get("body", ""), email.get("sender", "")
    gmail_id = email.get("id", "")
    stats["processed"] += 1

    if not is_job_related(subject, body, sender):
        stats["skipped"] += 1
        handled.append(gmail_id)
        outcomes["filtered: tier 1"] += 1
        return

    classification = status_classifier.classify_email_ai(email)
    keep, resolved = _fill_gaps(classification, email)
    outcomes[f"{classification.get('method', '?')}: {classification.get('status')}"] += 1

    if not keep:
        logger.info("  -> Not stored (company or status unknown): [%s]", subject[:50])
        stats["skipped"] += 1
        if resolved:
            handled.append(gmail_id)
        return

    logger.info("  [%s] -> %s @ %s (status=%s)", subject[:50], classification["role"],
                classification["company"], classification["status"])
    if dry_run:
        return

    if classification["status"] == "Job Opportunity":
        _handle_opportunity(email, classification)
        stats["skipped"] += 1
        handled.append(gmail_id)
        return

    analysis = company_researcher.analyze_company(classification["company"], classification["role"], classification["status"])
    # Keep the more severe of the email-level check (fee requests, spoofed senders…)
    # and the company-level research, so neither hides the other.
    if _risk_rank(analysis["scam_risk"]) >= _risk_rank(classification.get("scam_risk")):
        classification["scam_risk"] = analysis["scam_risk"]
        classification["risk_notes"] = analysis["risk_notes"]
    classification["prep_sheet"] = analysis["prep_sheet"]

    result = db_manager.upsert_application(email, classification)
    action = result.get("action", "skipped")
    stats["created" if action == "created" else "updated" if action == "updated" else "skipped"] += 1
    handled.append(gmail_id)

    if result.get("status_changed"):
        try:
            telegram_notifier.notify_status_change(email, classification, action)
        except Exception as exc:
            logger.warning("Telegram notify failed: %s", exc)


def run_once(days: str | None = None, force: bool = False, dry_run: bool = False,
             limit: int | None = None, trigger: str = "manual") -> dict:
    """
    Execute one sync. Returns stats: {fetched, new, processed, created, updated, skipped, errors},
    or {"status": "limit_reached" | "already_running"} if it didn't start.
    """
    if not dry_run:
        allowed, quota = can_sync()
        if not allowed and not force:
            logger.warning("Daily sync limit reached (%d/%d). Resets at %s.",
                           quota["syncs_today"], quota["daily_limit"], quota.get("resets_at", "00:00 UTC"))
            return {"status": "limit_reached", "quota": quota}
        if cloud_state.available() and cloud_state.active_run():
            logger.info("Another sync is already running; skipping this one.")
            return {"status": "already_running"}

    started = time.time()
    effective_days = days or config.GMAIL_DAYS
    query = config.GMAIL_QUERY
    if effective_days and effective_days.lower() != "all":
        query = f"{config._base_query} newer_than:{effective_days}d"

    stats = {"fetched": 0, "new": 0, "processed": 0, "created": 0, "updated": 0, "skipped": 0, "errors": 0}
    run_id = None
    if not dry_run:
        run_id = cloud_state.start_run(trigger, effective_days) if cloud_state.available() else None
        _update_pipeline_status({
            "is_running": True, "status": "running",
            "start_time": datetime.now(timezone.utc).isoformat(),
            "days_filter": effective_days or "ALL", "stats": stats,
        })

    status_classifier.reset_gemini_session()
    print_startup_diagnostics()

    try:
        service = gmail_reader.get_gmail_service()
        ids = gmail_reader.list_message_ids(service, max_results=config.GMAIL_MAX_RESULTS, query=query)
    except Exception as exc:
        logger.error("Gmail access failed: %s", exc)
        if not dry_run:
            _finish(run_id, "error", stats, started, f"Gmail access failed: {exc}")
        return stats

    if not dry_run:
        record_sync()

    new_ids = email_history.filter_unprocessed(ids)
    if limit:
        new_ids = new_ids[:limit]
    stats["fetched"] = len(ids)
    stats["new"] = len(new_ids)
    logger.info("%d matching emails, %d new", len(ids), len(new_ids))

    emails = [e for e in (gmail_reader.fetch_message(service, i) for i in new_ids) if e]
    # Gmail returns newest first; oldest first lets the latest email decide the status.
    emails.sort(key=lambda e: e.get("date_iso") or "")

    handled: list = []
    outcomes: Counter = Counter()
    for email in emails:
        try:
            _process_email(email, stats, handled, outcomes, dry_run)
        except Exception as exc:
            # Not marked as handled, so it's retried on the next run.
            logger.error("Failed to process [%s]: %s", email.get("subject", "")[:50], exc)
            stats["errors"] += 1

    if dry_run:
        print("Dry run (nothing stored, no alerts). Outcomes:", dict(outcomes))
        return stats

    email_history.mark_processed(handled)
    logger.info("Run complete | %s", " ".join(f"{k}={v}" for k, v in stats.items()))
    try:
        telegram_notifier.notify_summary(stats)
    except Exception as exc:
        logger.warning("Telegram summary failed: %s", exc)
    _finish(run_id, "success", stats, started)
    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="InternPulse: Gmail scanner and application tracker")
    parser.add_argument("--days", "-d", type=str, default=None, help="Scan emails newer than N days (e.g. 7, 30)")
    parser.add_argument("--force", "-f", action="store_true", help="Bypass the daily sync limit")
    parser.add_argument("--dry-run", action="store_true", help="Classify only: no writes, no alerts, no quota used")
    parser.add_argument("--limit", type=int, default=None, help="Process at most N new emails")
    args = parser.parse_args()
    run_once(days=args.days, force=args.force, dry_run=args.dry_run, limit=args.limit)
