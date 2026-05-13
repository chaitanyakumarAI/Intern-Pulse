"""
main.py — Entry point and pipeline orchestrator for AI Job Tracker.

Pipeline:
  1. Print startup diagnostics
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
    python main.py                   # run once
    python scheduler.py              # run on schedule (every N hours)
    python scheduler.py --once       # same as python main.py
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

# Initialise logging first so all imports use correct level
logger = setup_logging("main")


def run_once() -> dict:
    """
    Execute one full scan-classify-upsert cycle.
    Returns a stats dict: {fetched, new, processed, created, updated, skipped, errors}
    """
    from gmail_reader import get_gmail_service, fetch_messages
    from status_classifier import classify_email_ai
    from notion_updater import upsert_application
    from telegram_notifier import notify_status_change, notify_summary
    from utils import is_job_related
    from email_history import get_processed_ids, mark_processed

    stats = {
        "fetched": 0, "new": 0, "processed": 0,
        "created": 0, "updated": 0, "skipped": 0, "errors": 0,
    }

    # ── Startup ────────────────────────────────────────────────────────────────
    print_startup_diagnostics()
    logger.info("=" * 60)
    logger.info("AI Job Tracker — starting pipeline run")
    logger.info("=" * 60)

    # ── Step 1: Gmail authentication ──────────────────────────────────────────
    try:
        service = get_gmail_service()
    except Exception as exc:
        logger.error("Gmail authentication failed: %s", exc)
        logger.error("Ensure credentials.json is present and valid.")
        return stats

    # ── Step 2: Fetch emails ──────────────────────────────────────────────────
    try:
        emails = fetch_messages(service, max_results=config.GMAIL_MAX_RESULTS)
    except Exception as exc:
        logger.error("Failed to fetch Gmail messages: %s", exc)
        return stats

    stats["fetched"] = len(emails)
    if not emails:
        logger.info("No emails fetched from Gmail.")
        return stats

    # ── Step 3: Filter already-processed emails ────────────────────────────────
    processed_ids = get_processed_ids()
    new_emails = [e for e in emails if e.get("id") not in processed_ids]
    stats["new"] = len(new_emails)

    logger.info(
        "Fetched %d emails | %d already processed | %d new to check",
        stats["fetched"], len(emails) - len(new_emails), stats["new"],
    )

    if not new_emails:
        logger.info("All emails already processed — nothing to do.")
        return stats

    # ── Check Notion availability ─────────────────────────────────────────────
    notion_available = (
        bool(config.NOTION_API_KEY)
        and not config.NOTION_API_KEY.startswith("your_")
        and bool(config.NOTION_DATABASE_ID)
        and not config.NOTION_DATABASE_ID.startswith("your_")
    )

    newly_processed_ids = []

    # ── Step 4: Per-email pipeline ────────────────────────────────────────────
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
            continue

        if classification.get("status") == "Unknown":
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

        # b) Validation Layer
        company = classification.get("company", "Unknown")
        role = classification.get("role", "Unknown")
        status = classification.get("status", "Unknown")
        
        if company == "Unknown" or role == "Unknown" or status == "Unknown":
            logger.info("  -> Skipping insertion: failed validation (Unknown company/role/status)")
            stats["skipped"] += 1
            newly_processed_ids.append(gmail_id)
            continue
            
        # c) Notion upsert
        if notion_available:
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

                # c) Telegram alert on status change
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
                "    (Notion not configured — classification only: %s)",
                json.dumps(classification, indent=None),
            )
            stats["skipped"] += 1
            newly_processed_ids.append(gmail_id)

    # ── Step 5: Persist processed IDs ─────────────────────────────────────────
    if newly_processed_ids:
        mark_processed(newly_processed_ids)
        logger.info("Marked %d emails as processed.", len(newly_processed_ids))

    # ── Step 6: Summary ───────────────────────────────────────────────────────
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

    return stats


if __name__ == "__main__":
    run_once()
