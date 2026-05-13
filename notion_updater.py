"""
notion_updater.py — Create and update Notion database rows for job applications.

Actual DB schema (verified via API):
  Company          (title)
  Role             (rich_text)
  Platform         (select)   — options: LinkedIn, Email, Internshala, Unstop, etc.
  Applied Date     (date)
  Status           (select)   — our canonical labels
  Last Checked     (date)
  Application Link (url)
  Notes            (rich_text) — prefixed with [eid:xxxx] for deduplication
  Resume Version   (rich_text)

Deduplication:
  Email ID is embedded in Notes as a prefix [eid:<sha1>].
  We query Notion for that string; if found → update; else → create.

Note: The database returns object type "data_source" in the Notion v3 API.
      We use client.databases.query() which still works for data_source objects.
"""
import logging
from typing import Optional

from notion_client import Client
from notion_client.errors import APIResponseError

import config
from utils import now_iso, retry, truncate

logger = logging.getLogger(__name__)

_client: Optional[Client] = None

DB_ID = "35e795ad-1302-80ee-b6e4-000b7ec0cef7"  # canonical ID from API


def _get_client() -> Client:
    global _client
    if _client is None:
        if not config.NOTION_API_KEY or config.NOTION_API_KEY.startswith("your_"):
            raise EnvironmentError("NOTION_API_KEY is not set. Please fill in your .env file.")
        _client = Client(auth=config.NOTION_API_KEY)
    return _client


def _get_db_id() -> str:
    """Return DB ID — prefer .env value, fallback to hardcoded."""
    env_id = config.NOTION_DATABASE_ID
    if env_id and not env_id.startswith("your_"):
        return env_id
    return DB_ID


# ── Property builders ─────────────────────────────────────────────────────────

def _title(text: str) -> dict:
    return {"title": [{"text": {"content": str(text)[:2000]}}]}

def _rich_text(text: str) -> dict:
    return {"rich_text": [{"text": {"content": str(text)[:2000]}}]}

def _select(value: str) -> dict:
    return {"select": {"name": str(value)}}

def _url(link: Optional[str]) -> dict:
    return {"url": str(link)[:2000]} if link else {"url": None}

def _date(iso: Optional[str]) -> dict:
    return {"date": {"start": iso}} if iso else {"date": None}


# ── Build properties ──────────────────────────────────────────────────────────

def _build_properties(email: dict, classification: dict) -> dict:
    """
    Map classification result to Notion page properties.
    Embeds email_id inside Notes for deduplication: [eid:xxxx] ...
    """
    email_id  = email.get("email_id", "")
    notes_raw = classification.get("notes", "")
    notes_full = f"[eid:{email_id}] {notes_raw}".strip()

    oa_link  = classification.get("oa_link") or None
    date_iso = email.get("date_iso")

    return {
        "Company":          _title(classification.get("company", "Unknown")),
        "Role":             _rich_text(classification.get("role", "Unknown")),
        "Status":           _select(classification.get("status", "Unknown")),
        "Platform":         _select(classification.get("platform", "Email")),
        "Applied Date":     _date(date_iso),
        "Last Checked":     _date(now_iso()),
        "Application Link": _url(oa_link),
        "Notes":            _rich_text(notes_full),
        "Resume Version":   _rich_text(""),
    }


# ── Deduplication ─────────────────────────────────────────────────────────────

@retry(max_attempts=3, delay=1.5)
def _find_existing_page(email_id: str, company: str = "", role: str = "") -> Optional[dict]:
    """
    Search Notion for an existing page.
    1. First tries exact match by email_id in Notes.
    2. Then tries exact match by Company + Role to merge duplicates.
    """
    client = _get_client()
    db_id  = _get_db_id()
    
    # 1. Exact email ID match
    search_str = f"[eid:{email_id}]"
    try:
        resp = client.data_sources.query(
            db_id,
            filter={
                "property": "Notes",
                "rich_text": {"contains": search_str},
            },
        )
        results = resp.get("results", [])
        if results: return results[0]
    except APIResponseError as exc:
        logger.error("Notion dedup query error: %s", exc)
        raise

    # 2. Company + Role match (to merge different emails about same job)
    if company and company != "Unknown" and role and role != "Unknown":
        try:
            resp = client.data_sources.query(
                db_id,
                filter={
                    "and": [
                        {"property": "Company", "title": {"equals": company}},
                        {"property": "Role", "rich_text": {"equals": role}}
                    ]
                }
            )
            results = resp.get("results", [])
            if results: return results[0]
        except APIResponseError:
            pass

    return None


# ── Upsert ────────────────────────────────────────────────────────────────────

@retry(max_attempts=3, delay=1.5)
def upsert_application(email: dict, classification: dict) -> dict:
    """
    Insert or update a Notion row.
    Returns: {action: 'created'|'updated'|'skipped', page_id, status_changed}
    """
    client   = _get_client()
    db_id    = _get_db_id()
    email_id = email.get("email_id", "")
    new_status = classification.get("status", "Unknown")
    company = classification.get("company", "Unknown")
    role = classification.get("role", "Unknown")

    if new_status == "Unknown":
        logger.debug("Skipping Unknown status: %s", truncate(email.get("subject", "")))
        return {"action": "skipped", "page_id": None, "status_changed": False}

    props    = _build_properties(email, classification)
    existing = _find_existing_page(email_id, company, role)

    if existing:
        page_id = existing["id"]
        try:
            old_status = existing["properties"]["Status"]["select"]["name"]
        except (KeyError, TypeError):
            old_status = None

        status_changed = old_status != new_status

        if status_changed:
            client.pages.update(page_id=page_id, properties=props)
            logger.info(
                "Updated row %s: %s → %s  [%s]",
                page_id[:8], old_status, new_status,
                truncate(email.get("subject", "")),
            )
        else:
            logger.debug("No status change for %s (%s); skipping.", email_id, new_status)

        return {"action": "updated", "page_id": page_id, "status_changed": status_changed}

    else:
        try:
            new_page = client.pages.create(
                parent={"type": "data_source_id", "data_source_id": db_id},
                properties=props,
            )
            page_id = new_page["id"]
            logger.info(
                "Created row %s: %s @ %s [%s]",
                page_id[:8],
                classification.get("role", "?"),
                classification.get("company", "?"),
                new_status,
            )
            return {"action": "created", "page_id": page_id, "status_changed": True}
        except APIResponseError as exc:
            logger.error("Notion create error: %s", exc)
            raise


# ── Fetch all rows ────────────────────────────────────────────────────────────

def get_all_applications() -> list[dict]:
    """Fetch all rows (handles Notion pagination)."""
    client  = _get_client()
    db_id   = _get_db_id()
    results = []
    cursor  = None

    while True:
        try:
            kwargs = {"filter": None}  # no filter — get all
            if cursor:
                kwargs["start_cursor"] = cursor
            # Remove None values
            kwargs = {k: v for k, v in kwargs.items() if v is not None}
            resp = client.data_sources.query(db_id, **kwargs)
        except APIResponseError as exc:
            logger.error("Notion query error: %s", exc)
            break

        results.extend(resp.get("results", []))
        if not resp.get("has_more"):
            break
        cursor = resp.get("next_cursor")

    logger.info("Fetched %d rows from Notion.", len(results))
    return results
