"""
db_manager.py — Universal Database Layer for InternPulse.
Primary Engine: Supabase (PostgreSQL via REST PostgREST API).
Fallback Engine: Local SQLite (data/jobs.db) if Supabase credentials are not yet configured.

Features:
  - Zero-latency application querying and upserting.
  - Native canonical slug matching to prevent duplicates forever.
  - Status progression hierarchy protection (never downgrades progress).
  - Built-in migration and backup loaders.
"""
import os
import re
import json
import sqlite3
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

import config
from utils import now_iso, retry, truncate

logger = logging.getLogger(__name__)

# Resilient HTTP session to prevent transient socket resets
_session = requests.Session()
_adapter = HTTPAdapter(max_retries=Retry(total=3, backoff_factor=0.3, status_forcelist=[500, 502, 503, 504], raise_on_status=False))
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)

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

def normalize_slug(name: str) -> str:
    """Create a unified comparison slug for company names."""
    if not name:
        return ""
    slug = name.lower().replace("é", "e").replace("è", "e")
    slug = re.sub(r"^(?:team\.|hr\s+|updates\.|em\.|indiacampus\.|workday\s+)", "", slug)
    slug = re.sub(r"\s+(?:human resources|workday notifications|job alerts|careers|recruiting|talent acquisition|recruitment|team|hr|fintech|technologies|pvt|ltd|inc|corp|opc private limted)$", "", slug)
    slug = re.sub(r"[^a-z0-9]", "", slug)
    
    # Canonical aliases
    if "loreal" in slug or "loral" in slug: return "loreal"
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


# ── Configuration & Client Detection ──────────────────────────────────────────

def _get_supabase_config() -> Optional[Dict[str, str]]:
    url = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        or ""
    )
    if url and key and not url.startswith("your_") and not key.startswith("your_"):
        return {"url": url, "key": key}
    return None


# ── SQLite Fallback Engine ───────────────────────────────────────────────────

SQLITE_PATH = config.DATA_DIR / "jobs.db"
CANONICAL_JSON_PATH = config.DATA_DIR / "canonical_applications.json"

def _init_sqlite():
    SQLITE_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(SQLITE_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS applications (
            id TEXT PRIMARY KEY,
            company TEXT NOT NULL,
            company_slug TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL DEFAULT 'Candidate / Intern',
            status TEXT NOT NULL DEFAULT 'Applied',
            platform TEXT DEFAULT 'Direct Email',
            applied_date TEXT,
            last_checked TEXT,
            application_link TEXT,
            email_id TEXT,
            scam_risk TEXT DEFAULT 'Low',
            risk_notes TEXT DEFAULT '',
            prep_sheet TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT,
            updated_at TEXT
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_comp_slug ON applications (company_slug)")
    conn.commit()
    conn.close()

_init_sqlite()

def _sync_json_backup():
    try:
        apps = get_all_applications()
        CANONICAL_JSON_PATH.parent.mkdir(exist_ok=True)
        with open(CANONICAL_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(apps, f, indent=2)

        web_data = config.ROOT_DIR / "web" / "data" / "canonical_applications.json"
        web_data.parent.mkdir(exist_ok=True)
        with open(web_data, "w", encoding="utf-8") as f:
            json.dump(apps, f, indent=2)
    except Exception as e:
        logger.warning("Could not sync JSON backup: %s", e)



# ── Supabase PostgREST Client Helpers ─────────────────────────────────────────

def _supabase_headers(cfg: Dict[str, str]) -> Dict[str, str]:
    return {
        "apikey": cfg["key"],
        "Authorization": f"Bearer {cfg['key']}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }


# ── Core Operations ──────────────────────────────────────────────────────────

def get_all_applications() -> List[Dict[str, Any]]:
    """Fetch all job applications ordered by latest update."""
    sb = _get_supabase_config()
    if sb:
        try:
            endpoint = f"{sb['url']}/rest/v1/applications?select=*&order=last_checked.desc"
            resp = _session.get(endpoint, headers=_supabase_headers(sb), timeout=10)
            if resp.status_code == 200:
                rows = resp.json()
                logger.info("Retrieved %d applications from Supabase.", len(rows))
                return rows
            else:
                logger.warning("Supabase GET error (%d): %s. Falling back to SQLite.", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("Supabase request failed: %s. Falling back to SQLite.", e)

    # SQLite fallback
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM applications ORDER BY last_checked DESC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def find_application_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    """Find application by canonical company slug."""
    if not slug:
        return None
    sb = _get_supabase_config()
    if sb:
        try:
            endpoint = f"{sb['url']}/rest/v1/applications?company_slug=eq.{slug}&select=*"
            resp = _session.get(endpoint, headers=_supabase_headers(sb), timeout=10)
            if resp.status_code == 200:
                rows = resp.json()
                return rows[0] if rows else None
        except Exception as e:
            logger.warning("Supabase lookup failed: %s", e)

    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM applications WHERE company_slug = ?", (slug,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_application(email: dict, classification: dict) -> dict:
    """
    Insert or update an application row.
    Prevents duplicate entries via canonical company_slug matching.
    Preserves highest status progression hierarchy.
    """
    company = classification.get("company", "Unknown").strip()
    role = classification.get("role", "Candidate / Intern").strip()
    status = classification.get("status", "Unknown")
    platform = classification.get("platform", "Direct Email")
    email_id = email.get("email_id", "")
    date_iso = email.get("date_iso") or now_iso()
    oa_link = classification.get("oa_link") or None
    scam_risk = classification.get("scam_risk", "Low")
    risk_notes = classification.get("risk_notes", "")
    prep_sheet = classification.get("prep_sheet", "")
    notes = classification.get("notes", "")

    if status == "Unknown":
        return {"action": "skipped", "id": None, "status_changed": False}

    slug = normalize_slug(company)
    existing = find_application_by_slug(slug)
    now_str = now_iso()

    if existing:
        row_id = existing["id"]
        old_status = existing.get("status", "Unknown")
        old_rank = STATUS_HIERARCHY.get(old_status, 0)
        new_rank = STATUS_HIERARCHY.get(status, 0)
        effective_status = status if new_rank >= old_rank else old_status

        # If previous role was generic, upgrade it to new specific role
        old_role = existing.get("role", "")
        effective_role = role
        if old_role and old_role not in ("Candidate / Intern", "Unknown", "Intern") and role in ("Candidate / Intern", "Unknown"):
            effective_role = old_role

        status_changed = (old_status != effective_status)

        update_payload = {
            "status": effective_status,
            "role": effective_role,
            "last_checked": now_str,
            "updated_at": now_str,
        }
        if oa_link: update_payload["application_link"] = oa_link
        if scam_risk and scam_risk != "Unknown": update_payload["scam_risk"] = scam_risk
        if risk_notes: update_payload["risk_notes"] = risk_notes
        if prep_sheet: update_payload["prep_sheet"] = prep_sheet
        if notes: update_payload["notes"] = f"{existing.get('notes', '')}\n{notes}".strip()

        sb = _get_supabase_config()
        if sb:
            try:
                endpoint = f"{sb['url']}/rest/v1/applications?id=eq.{row_id}"
                resp = _session.patch(endpoint, headers=_supabase_headers(sb), json=update_payload, timeout=10)
                if resp.status_code in (200, 204):
                    logger.info("Supabase updated row %s (%s): %s -> %s", row_id[:8], company, old_status, effective_status)
                    return {"action": "updated", "id": row_id, "status_changed": status_changed}
            except Exception as e:
                logger.warning("Supabase update failed: %s", e)

        # SQLite update fallback
        conn = sqlite3.connect(SQLITE_PATH)
        cur = conn.cursor()
        cur.execute("""
            UPDATE applications 
            SET status = ?, role = ?, last_checked = ?, updated_at = ?, scam_risk = COALESCE(?, scam_risk)
            WHERE id = ?
        """, (effective_status, effective_role, now_str, now_str, scam_risk, row_id))
        conn.commit()
        conn.close()
        _sync_json_backup()
        return {"action": "updated", "id": row_id, "status_changed": status_changed}

    else:
        # Create new application
        import uuid
        row_id = str(uuid.uuid4())
        new_payload = {
            "id": row_id,
            "company": company,
            "company_slug": slug,
            "role": role,
            "status": status,
            "platform": platform,
            "applied_date": date_iso,
            "last_checked": now_str,
            "application_link": oa_link,
            "email_id": email_id,
            "scam_risk": scam_risk,
            "risk_notes": risk_notes,
            "prep_sheet": prep_sheet,
            "notes": notes,
            "created_at": now_str,
            "updated_at": now_str
        }

        sb = _get_supabase_config()
        if sb:
            try:
                endpoint = f"{sb['url']}/rest/v1/applications"
                resp = _session.post(endpoint, headers=_supabase_headers(sb), json=new_payload, timeout=10)
                if resp.status_code in (200, 201):
                    logger.info("Supabase created application %s: %s @ %s [%s]", row_id[:8], role, company, status)
                    _sync_json_backup()
                    return {"action": "created", "id": row_id, "status_changed": True}
            except Exception as e:
                logger.warning("Supabase insert failed: %s", e)

        # SQLite insert fallback
        conn = sqlite3.connect(SQLITE_PATH)
        cur = conn.cursor()
        cur.execute("""
            INSERT OR REPLACE INTO applications 
            (id, company, company_slug, role, status, platform, applied_date, last_checked, application_link, email_id, scam_risk, risk_notes, prep_sheet, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (row_id, company, slug, role, status, platform, date_iso, now_str, oa_link, email_id, scam_risk, risk_notes, prep_sheet, notes, now_str, now_str))
        conn.commit()
        conn.close()
        _sync_json_backup()
        logger.info("SQLite created application %s: %s @ %s [%s]", row_id[:8], role, company, status)
        return {"action": "created", "id": row_id, "status_changed": True}


def update_application_status(app_id: str, new_status: str) -> bool:
    """Update status of a specific application by id."""
    now_str = now_iso()
    sb = _get_supabase_config()
    if sb:
        try:
            endpoint = f"{sb['url']}/rest/v1/applications?id=eq.{app_id}"
            resp = _session.patch(
                endpoint,
                headers=_supabase_headers(sb),
                json={"status": new_status, "last_checked": now_str, "updated_at": now_str},
                timeout=10
            )
            if resp.status_code in (200, 204):
                logger.info("Supabase status updated for row %s -> %s", app_id[:8], new_status)
                _sync_json_backup()
                return True
        except Exception as e:
            logger.warning("Supabase status update failed: %s", e)

    try:
        conn = sqlite3.connect(SQLITE_PATH)
        cur = conn.cursor()
        cur.execute("UPDATE applications SET status = ?, last_checked = ?, updated_at = ? WHERE id = ?", (new_status, now_str, now_str, app_id))
        conn.commit()
        updated = cur.rowcount > 0
        conn.close()
        if updated:
            _sync_json_backup()
        return updated
    except Exception as e:
        logger.error("SQLite status update failed: %s", e)
        return False


def search_applications(query: str) -> Optional[Dict[str, Any]]:
    """Search for an application by exact slug or company substring."""
    if not query:
        return None
    slug = normalize_slug(query)
    match = find_application_by_slug(slug)
    if match:
        return match

    all_apps = get_all_applications()
    q_lower = query.strip().lower()
    for app in all_apps:
        co = app.get("company", "").lower()
        if q_lower in co or co in q_lower:
            return app
    return None


def get_pipeline_stats() -> Dict[str, Any]:
    """Calculate aggregated telemetry across all applications."""
    apps = get_all_applications()
    counts: Dict[str, int] = {}
    high_scam_count = 0
    recent_7d = 0
    now = datetime.now(timezone.utc)

    for a in apps:
        st = a.get("status", "Unknown")
        counts[st] = counts.get(st, 0) + 1
        if a.get("scam_risk") == "High":
            high_scam_count += 1
        
        # Check recent
        d_str = a.get("applied_date") or a.get("last_checked")
        if d_str:
            try:
                clean_d = d_str.replace("Z", "+00:00")
                d_obj = datetime.fromisoformat(clean_d)
                if (now - d_obj).days <= 7:
                    recent_7d += 1
            except Exception:
                pass

    return {
        "total": len(apps),
        "status_counts": counts,
        "high_scam_count": high_scam_count,
        "recent_7d": recent_7d
    }
