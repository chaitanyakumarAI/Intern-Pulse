"""
scheduler.py — Note: Recurring interval polling has been deprecated in favor of on-demand
daily quota-limited syncs (DAILY_SYNC_LIMIT).

Usage:
    python scheduler.py              # runs a single quota-checked sync
    python scheduler.py --force      # bypass daily limit for testing
"""
import sys
import argparse
import config
from config import setup_logging
from sync_quota import can_sync, get_quota, record_sync

logger = setup_logging("scheduler")


def run_pipeline(force: bool = False) -> None:
    """Check daily quota and execute the main pipeline once."""
    allowed, quota = can_sync()
    if not allowed and not force:
        logger.warning(
            "Daily Gmail sync limit reached (%d/%d used today). Resets at %s. Use --force to override.",
            quota["syncs_today"], quota["daily_limit"], quota.get("resets_at", "00:00 UTC")
        )
        return

    from main import run_once
    logger.info("Executing sync (%d/%d used before this run)...", quota["syncs_today"], quota["daily_limit"])
    run_once()
    record_sync()
    logger.info("Sync complete.")


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Job Tracker Sync Runner (Daily Limit)")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run once immediately and exit",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Bypass daily sync quota limit",
    )
    args = parser.parse_args()

    logger.info("Note: The recurring time-loop scheduler has been replaced with the Daily Quota Sync engine.")
    run_pipeline(force=args.force)


if __name__ == "__main__":
    main()
