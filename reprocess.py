"""
reprocess.py — Rebuild the AI Internship Tracker dataset.

This script:
1. Archives all existing rows in the Notion database.
2. Clears the local email history cache.
3. Fetches the last 100 emails and reprocesses them with the improved AI pipeline.
"""
import sys
import logging
from notion_client import Client

# Fix Windows encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import config
from config import setup_logging
from email_history import clear_history
from dashboard import fetch_all_rows
from main import run_once

logger = setup_logging("reprocess")

def clear_notion_db():
    if not config.NOTION_API_KEY or config.NOTION_API_KEY.startswith("your_"):
        logger.error("NOTION_API_KEY not configured. Cannot clear.")
        return

    client = Client(auth=config.NOTION_API_KEY)
    logger.info("Fetching all existing Notion rows to archive...")
    rows = fetch_all_rows()
    
    if not rows:
        logger.info("Notion database is already empty.")
        return

    logger.info(f"Archiving {len(rows)} rows...")
    for i, row in enumerate(rows):
        try:
            client.pages.update(page_id=row["id"], archived=True)
            if (i + 1) % 5 == 0:
                logger.info(f"  Archived {i + 1}/{len(rows)}...")
        except Exception as e:
            logger.error(f"Failed to archive row {row['id']}: {e}")
            
    logger.info("Successfully cleared Notion database.")

def main():
    logger.info("=" * 60)
    logger.info("STARTING FULL REPROCESSING")
    logger.info("=" * 60)

    # 1. Clear Notion
    clear_notion_db()
    
    # 2. Clear local cache
    clear_history()
    
    # 3. Temporarily increase max results to process more history
    original_max = config.GMAIL_MAX_RESULTS
    config.GMAIL_MAX_RESULTS = 100
    
    logger.info("Starting pipeline run on last 100 emails...")
    stats = run_once()
    
    # Restore config
    config.GMAIL_MAX_RESULTS = original_max
    
    logger.info("=" * 60)
    logger.info("REPROCESSING COMPLETE")
    logger.info(f"Processed: {stats.get('processed')}, Created: {stats.get('created')}")
    logger.info("=" * 60)

if __name__ == "__main__":
    main()
