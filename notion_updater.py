# -*- coding: utf-8 -*-
"""
notion_updater.py -- Create and update Notion database rows for job applications.

Actual DB schema (verified via API):
  Company          (title)
  Role             (rich_text)
  Platform         (select)   -- options: LinkedIn, Email, Internshala, Unstop, etc.
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
import re
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
    """Return DB ID -- prefer .env value, fallback to hardcoded."""
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

def _build_properties(email: dict, classification: dict, status: str = None) -> dict:
    """
    Map classification result to Notion page properties.
    Embeds email_id inside Notes for deduplication: [eid:xxxx] ...
    """
    email_id  = email.get("email_id", "")
    notes_raw = classification.get("notes", "")
    notes_full = f"[eid:{email_id}] {notes_raw}".strip()

    effective_status = status or classification.get("status", "Unknown")
    oa_link  = classification.get("oa_link") or None
    date_iso = email.get("date_iso")

    return {
        "Company":          _title(classification.get("company", "Unknown")),
        "Role":             _rich_text(classification.get("role", "Unknown")),
        "Status":           _select(effective_status),
        "Platform":         _select(classification.get("platform", "Email")),
        "Applied Date":     _date(date_iso),
        "Last Checked":     _date(now_iso()),
        "Application Link": _url(oa_link),
        "Notes":            _rich_text(notes_full),
        "Resume Version":   _rich_text(""),
    }


# ── Deduplication & Normalization ─────────────────────────────────────────────

def normalize_slug(name: str) -> str:
    """Create a unified comparison slug for company names."""
    if not name:
        return ""
    slug = name.lower()
    slug = re.sub(r"^(?:team\.|hr\s+|updates\.|em\.|indiacampus\.|workday\s+)", "", slug)
    slug = re.sub(r"\s+(?:human resources|workday notifications|job alerts|careers|recruiting|talent acquisition|recruitment|team|hr|fintech|technologies|pvt|ltd|inc|corp|opc private limted)$", "", slug)
    slug = re.sub(r"[^a-z0-9]", "", slug)
    
    # Aliases
    if "loreal" in slug: return "loreal"
    if "accenture" in slug: return "accenture"
    if "appliedmaterials" in slug or "amat" in slug: return "appliedmaterials"
    if "bluestock" in slug: return "bluestock"
    if "geaerospace" in slug or "general electric" in slug: return "geaerospace"
    if "electronicarts" in slug or slug == "ea": return "electronicarts"
    if "jpmorgan" in slug or "jpmc" in slug: return "jpmorganchase"
    if "doordash" in slug: return "doordash"
    if "walmart" in slug: return "walmart"
    if "barclays" in slug: return "barclays"
    if "target" in slug: return "target"
    if "smytten" in slug: return "smytten"
    if "iitbhilai" in slug or "ccps" in slug: return "ccpsiitbhilai"
    if "jobrapido" in slug or "grace" in slug: return "jobrapido"
    if "abekus" in slug or "stuti" in slug: return "abekus"
    if "csk" in slug: return "csktechnologies"
    if "quickhyre" in slug: return "quickhyre"
    if "swiggy" in slug: return "swiggy"
    if "labmentix" in slug: return "labmentix"

    return slug


STATUS_HIERARCHY = {
    "Offer": 7,
    "Interview Scheduled": 6,
    "OA Sent": 5,
    "Under Review": 4,
    "Applied": 3,
    "Needs Review": 2,
    "Job Opportunity": 2,
    "Rejected": 1,
    "Ghosted": 1,
    "Unknown": 0
}


@retry(max_attempts=3, delay=1.5)
def _find_existing_page(email_id: str, company: str = "", role: str = "") -> Optional[dict]:
    """
    Search Notion for an existing page.
    1. First tries exact match by email_id in Notes.
    2. Then tries canonical company slug to merge duplicates.
    """
    client = _get_client()
    db_id  = _get_db_id()
    
    # 1. Exact email ID match in Notes
    if email_id:
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

    # 2. Canonical company slug matching (merges multi-email threads/updates into same row)
    target_slug = normalize_slug(company)
    if target_slug and target_slug not in ("unknown", "directemail", "email"):
        try:
            resp = client.data_sources.query(db_id, page_size=100)
            for page in resp.get("results", []):
                p_props = page.get("properties", {})
                p_title = p_props.get("Company", {}).get("title", [])
                p_company = p_title[0].get("plain_text", "") if p_title else ""
                if normalize_slug(p_company) == target_slug:
                    return page
        except APIResponseError as exc:
            logger.warning("Notion slug query error: %s", exc)

    return None


# ── Upsert ────────────────────────────────────────────────────────────────────

@retry(max_attempts=3, delay=1.5)
def upsert_application(email: dict, classification: dict) -> dict:
    """
    Insert or update a Notion row with status progression and deduplication.
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

    existing = _find_existing_page(email_id, company, role)

    if existing:
        page_id = existing["id"]
        try:
            old_status = existing["properties"]["Status"]["select"]["name"]
        except (KeyError, TypeError):
            old_status = "Unknown"

        # Preserve the highest progression status in the hierarchy
        old_rank = STATUS_HIERARCHY.get(old_status, 0)
        new_rank = STATUS_HIERARCHY.get(new_status, 0)
        effective_status = new_status if new_rank >= old_rank else old_status

        # If existing role was generic, upgrade it to new role
        try:
            old_role_prop = existing["properties"]["Role"]["rich_text"]
            old_role = old_role_prop[0]["plain_text"] if old_role_prop else ""
        except (KeyError, TypeError, IndexError):
            old_role = ""

        effective_role = role
        if old_role and old_role not in ("Candidate / Intern", "Unknown", "Intern") and role in ("Candidate / Intern", "Unknown"):
            effective_role = old_role
            classification["role"] = effective_role

        props = _build_properties(email, classification, status=effective_status)
        status_changed = (old_status != effective_status)

        client.pages.update(page_id=page_id, properties=props)
        logger.info(
            "Updated row %s (%s): %s → %s  [%s]",
            page_id[:8], company, old_status, effective_status,
            truncate(email.get("subject", "")),
        )
        return {"action": "updated", "page_id": page_id, "status_changed": status_changed}

    else:
        props = _build_properties(email, classification, status=new_status)
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
