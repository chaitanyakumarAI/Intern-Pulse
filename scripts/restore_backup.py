"""
Restore your applications into Supabase from the local backup.

The pipeline keeps a copy of every application in data/canonical_applications.json
(and data/jobs.db when it runs without Supabase). Use this after creating a new
Supabase project, or if the old one was deleted:

    1. Run supabase_schema.sql in the new project's SQL editor
    2. Put the new SUPABASE_URL / SUPABASE_KEY in .env
    3. python scripts/restore_backup.py            # preview
       python scripts/restore_backup.py --apply    # write

Re-running is safe: rows are matched on company_slug and merged.
"""
import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import config  # noqa: E402
import db_manager  # noqa: E402
from status_classifier import PLATFORM_KEYWORDS  # noqa: E402

COLUMNS = ("company", "company_slug", "role", "status", "platform", "applied_date", "last_checked",
           "application_link", "email_id", "scam_risk", "risk_notes", "prep_sheet", "notes", "created_at")


def clean_notes(notes: str | None) -> str:
    """Drop pipeline internals that older versions wrote into the notes field."""
    notes = re.sub(r"\[eid:[^\]]*\]|\(keyword fallback\)|\[(?:HIGH|MEDIUM) RISK:[^\]]*\]", "", notes or "")
    notes = re.sub(r"^Conf: \d+\..*$", "", notes, flags=re.MULTILINE)
    return re.sub(r"\n{2,}", "\n", notes).strip()


def load_rows() -> list[dict]:
    json_path = config.DATA_DIR / "canonical_applications.json"
    if json_path.exists():
        return json.loads(json_path.read_text(encoding="utf-8"))
    db_path = config.DATA_DIR / "jobs.db"
    if db_path.exists():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        rows = [dict(r) for r in conn.execute("SELECT * FROM applications")]
        conn.close()
        return rows
    sys.exit("No backup found in data/ (canonical_applications.json or jobs.db).")


def prepare(rows: list[dict]) -> tuple[list[dict], list[str]]:
    keep, skipped = {}, []
    for row in rows:
        company = (row.get("company") or "").strip()
        slug = db_manager.normalize_slug(company)
        if not slug or company.lower() in PLATFORM_KEYWORDS or company == "Unknown":
            skipped.append(company or "(empty)")
            continue
        clean = {k: row.get(k) for k in COLUMNS}
        clean["company_slug"] = slug
        clean["notes"] = clean_notes(row.get("notes"))
        keep[slug] = clean  # last one wins if the backup has duplicates
    return list(keep.values()), skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Restore applications into Supabase from data/")
    parser.add_argument("--apply", action="store_true", help="Write to Supabase (default: preview only)")
    args = parser.parse_args()

    rows, skipped = prepare(load_rows())
    print(f"{len(rows)} applications to restore.")
    if skipped:
        print(f"Skipping {len(skipped)} rows whose 'company' is a job platform or empty: {', '.join(skipped)}")
    if not args.apply:
        print("Preview only. Run with --apply to write them to Supabase.")
        return
    if not db_manager._get_supabase_config():
        sys.exit("SUPABASE_URL / SUPABASE_KEY are not set in .env.")

    resp = db_manager.rest("POST", "applications?on_conflict=company_slug", json=rows,
                           prefer="resolution=merge-duplicates,return=minimal")
    if resp is None:
        sys.exit("Could not reach Supabase. Check SUPABASE_URL and that the project is running.")
    if resp.status_code not in (200, 201, 204):
        sys.exit(f"Supabase returned {resp.status_code}: {resp.text[:300]}")
    print(f"Restored {len(rows)} applications.")


if __name__ == "__main__":
    main()
