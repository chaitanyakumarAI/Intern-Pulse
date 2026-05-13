"""
setup_notion_db.py — One-time script to create all required columns in the Notion database.

Run once:  .venv\\Scripts\\python.exe setup_notion_db.py
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv(override=True)

from notion_client import Client
from notion_client.errors import APIResponseError

NOTION_API_KEY    = os.getenv("NOTION_API_KEY", "")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID", "")

client = Client(auth=NOTION_API_KEY)

# ── Property schema to add ────────────────────────────────────────────────────
# "Company" (title) already exists in every Notion DB by default
PROPERTIES = {
    "Role": {
        "rich_text": {}
    },
    "Status": {
        "select": {
            "options": [
                {"name": "Applied",              "color": "blue"},
                {"name": "Under Review",         "color": "yellow"},
                {"name": "OA Sent",              "color": "orange"},
                {"name": "Interview Scheduled",  "color": "purple"},
                {"name": "Rejected",             "color": "red"},
                {"name": "Offer",                "color": "green"},
                {"name": "Ghosted",              "color": "gray"},
                {"name": "Unknown",              "color": "default"},
            ]
        }
    },
    "Email ID": {
        "rich_text": {}
    },
    "Sender": {
        "rich_text": {}
    },
    "Subject": {
        "rich_text": {}
    },
    "Date Received": {
        "date": {}
    },
    "OA Link": {
        "url": {}
    },
    "Notes": {
        "rich_text": {}
    },
    "Last Updated": {
        "date": {}
    },
}

def setup():
    print(f"Fetching database: {NOTION_DATABASE_ID[:8]}…")
    try:
        db = client.databases.retrieve(database_id=NOTION_DATABASE_ID)
    except APIResponseError as e:
        print(f"  ERROR: Could not reach database — {e}")
        print("  Make sure the Notion integration is shared with this database.")
        sys.exit(1)

    existing = set(db.get("properties", {}).keys())
    print(f"  Existing columns: {sorted(existing)}")

    # Only add columns that don't exist yet
    to_add = {k: v for k, v in PROPERTIES.items() if k not in existing}

    if not to_add:
        print("  All columns already exist — nothing to add.")
    else:
        print(f"  Adding columns: {list(to_add.keys())}")
        try:
            client.databases.update(
                database_id=NOTION_DATABASE_ID,
                properties=to_add,
            )
            print("  Database schema updated successfully.")
        except APIResponseError as e:
            print(f"  ERROR updating schema: {e}")
            sys.exit(1)

    # Verify
    db2 = client.databases.retrieve(database_id=NOTION_DATABASE_ID)
    final_cols = sorted(db2.get("properties", {}).keys())
    print(f"\nFinal columns ({len(final_cols)}): {final_cols}")
    print("\nNotion DB is ready! You can now run:  .venv\\Scripts\\python.exe main.py")

if __name__ == "__main__":
    setup()
