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
    parser.add_argument(
        "--server",
        action="store_true",
        help="Run HTTP server mode (default if PORT env var is present)",
    )
    args = parser.parse_args()

    import os
    if (os.environ.get("PORT") or args.server) and not args.once:
        logger.info("PORT environment variable detected (%s). Starting HTTP server mode...", os.environ.get("PORT"))
        import server
        server.run_server()
        return

    logger.info("Note: The recurring time-loop scheduler has been replaced with the Daily Quota Sync engine.")
    run_pipeline(force=args.force)


if __name__ == "__main__":
    main()
