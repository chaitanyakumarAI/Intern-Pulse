"""
cloud_state.py — Durable pipeline state in Supabase.

Render's disk is wiped on every restart, so anything kept there (which emails were
handled, the company research cache, the sync history) would be lost. These tables
(see supabase_schema.sql) keep that state in one place for every runner.

If Supabase isn't configured or the tables don't exist yet, available() is False
and callers fall back to their local JSON files.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional

import db_manager

logger = logging.getLogger(__name__)

STALE_RUN_MINUTES = 20   # a "running" row older than this belongs to a crashed worker
_ID_CHUNK = 100          # keeps in.(...) filters within URL length limits

_tables_ready: Optional[bool] = None


def available() -> bool:
    """True when Supabase is configured and the state tables exist."""
    global _tables_ready
    if _tables_ready is None:
        resp = db_manager.rest("GET", "sync_runs?select=id&limit=1")
        _tables_ready = resp is not None and resp.status_code == 200
        if not _tables_ready:
            logger.info("Cloud state unavailable; using local state files. Run supabase_schema.sql to enable it.")
    return _tables_ready


def reset() -> None:
    """Forget the cached availability check (used by tests)."""
    global _tables_ready
    _tables_ready = None


def _ok(resp) -> bool:
    return resp is not None and resp.status_code in (200, 201, 204)


# ── Processed emails ──────────────────────────────────────────────────────────

def unprocessed(gmail_ids: List[str]) -> List[str]:
    """Return the IDs not yet handled, preserving order. On failure, treat all as new (upserts are idempotent)."""
    seen = set()
    for i in range(0, len(gmail_ids), _ID_CHUNK):
        chunk = ",".join(gmail_ids[i:i + _ID_CHUNK])
        resp = db_manager.rest("GET", f"processed_emails?select=gmail_id&gmail_id=in.({chunk})")
        if not _ok(resp):
            logger.warning("Could not read processed emails; treating this batch as new.")
            continue
        seen.update(row["gmail_id"] for row in resp.json())
    return [g for g in gmail_ids if g not in seen]


def mark_processed(gmail_ids: Iterable[str]) -> bool:
    rows = [{"gmail_id": g} for g in gmail_ids]
    if not rows:
        return True
    resp = db_manager.rest("POST", "processed_emails?on_conflict=gmail_id", json=rows,
                           prefer="resolution=ignore-duplicates,return=minimal")
    return _ok(resp)


# ── Company research cache ────────────────────────────────────────────────────

def company_get(key: str) -> Optional[Dict[str, str]]:
    resp = db_manager.rest("GET", "company_research?select=scam_risk,risk_notes,prep_sheet"
                                  f"&company_key=eq.{db_manager.quote_value(key)}")
    if _ok(resp) and resp.json():
        return resp.json()[0]
    return None


def company_set(key: str, data: Dict[str, str]) -> None:
    row = {"company_key": key, "scam_risk": data.get("scam_risk"), "risk_notes": data.get("risk_notes", ""),
           "prep_sheet": data.get("prep_sheet", ""), "updated_at": db_manager.now_iso()}
    db_manager.rest("POST", "company_research?on_conflict=company_key", json=row,
                    prefer="resolution=merge-duplicates,return=minimal")


# ── Sync runs ─────────────────────────────────────────────────────────────────

def _today_start() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00Z")


def _close_stale_runs() -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=STALE_RUN_MINUTES)).strftime("%Y-%m-%dT%H:%M:%SZ")
    db_manager.rest("PATCH", f"sync_runs?status=eq.running&started_at=lt.{cutoff}",
                    json={"status": "error", "error": "Interrupted (worker restarted)", "finished_at": db_manager.now_iso()},
                    prefer="return=minimal")


def active_run() -> Optional[dict]:
    """The run currently in progress, if any."""
    _close_stale_runs()
    resp = db_manager.rest("GET", "sync_runs?select=id,started_at&status=eq.running&order=started_at.desc&limit=1")
    if _ok(resp) and resp.json():
        return resp.json()[0]
    return None


def start_run(trigger: str, days: Optional[str]) -> Optional[str]:
    resp = db_manager.rest("POST", "sync_runs", json={"trigger": trigger, "days_filter": days or "ALL"},
                           prefer="return=representation")
    if _ok(resp) and resp.json():
        return resp.json()[0]["id"]
    return None


def finish_run(run_id: str, status: str, stats: Optional[dict] = None, error: Optional[str] = None) -> None:
    db_manager.rest("PATCH", f"sync_runs?id=eq.{run_id}",
                    json={"status": status, "stats": stats, "error": error, "finished_at": db_manager.now_iso()},
                    prefer="return=minimal")


def runs_today() -> int:
    """Syncs that count against the daily limit: failed runs don't."""
    resp = db_manager.rest("GET", f"sync_runs?select=id&status=in.(running,success)&started_at=gte.{_today_start()}")
    return len(resp.json()) if _ok(resp) else 0


def last_run_time() -> Optional[str]:
    resp = db_manager.rest("GET", "sync_runs?select=started_at&order=started_at.desc&limit=1")
    if _ok(resp) and resp.json():
        return resp.json()[0]["started_at"]
    return None


# ── Opportunities ─────────────────────────────────────────────────────────────

def save_opportunity(classification: dict) -> bool:
    """Store a job from a digest email. Returns True if it's new (so the caller can alert once)."""
    company = classification.get("company", "Unknown")
    role = classification.get("role", "Candidate / Intern")
    row = {
        "dedupe_key": f"{db_manager.normalize_slug(company)}:{db_manager.normalize_slug(role)}",
        "company": company,
        "role": role,
        "link": classification.get("oa_link"),
        "platform": classification.get("platform"),
        "scam_risk": classification.get("scam_risk", "Unknown"),
        "risk_notes": classification.get("risk_notes", ""),
    }
    resp = db_manager.rest("POST", "opportunities?on_conflict=dedupe_key", json=row,
                           prefer="resolution=ignore-duplicates,return=representation")
    return _ok(resp) and bool(resp.json())
