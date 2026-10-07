"""
migrate_notion_to_supabase.py — Seed Supabase (and local fallback) from Notion backup.
Migrates all canonical applications without any data loss.
"""
import json
import logging
from pathlib import Path
import config
from db_manager import upsert_application, get_all_applications, normalize_slug
from threat_detector import evaluate_threat

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("migration")

BACKUP_FILE = config.DATA_DIR / "notion_backup.json"

def migrate():
    if not BACKUP_FILE.exists():
        logger.error("Backup file %s not found. Run backup first.", BACKUP_FILE)
        return

    with open(BACKUP_FILE, "r", encoding="utf-8") as f:
        pages = json.load(f)

    logger.info("Loaded %d applications from Notion backup.", len(pages))
    migrated_count = 0

    for page in pages:
        props = page.get("properties", {})
        
        # Extract fields
        co_title = props.get("Company", {}).get("title", [])
        company = co_title[0].get("plain_text", "").strip() if co_title else "Unknown"
        
        ro_rich = props.get("Role", {}).get("rich_text", [])
        role = ro_rich[0].get("plain_text", "").strip() if ro_rich else "Candidate / Intern"
        
        st_sel = props.get("Status", {}).get("select")
        status = st_sel.get("name", "Applied") if st_sel else "Applied"
        
        pl_sel = props.get("Platform", {}).get("select")
        platform = pl_sel.get("name", "Direct Email") if pl_sel else "Direct Email"
        
        date_prop = props.get("Applied Date", {}).get("date")
        date_iso = date_prop.get("start") if date_prop else None
        
        link_prop = props.get("Application Link", {}).get("url")
        link = link_prop if link_prop else None
        
        notes_rich = props.get("Notes", {}).get("rich_text", [])
        notes = notes_rich[0].get("plain_text", "") if notes_rich else ""
        
        # Extract email_id from notes if present [eid:xxxx]
        import re
        eid_match = re.search(r"\[eid:([a-f0-9]+)\]", notes)
        email_id = eid_match.group(1) if eid_match else ""

        # Threat evaluation
        threat = evaluate_threat(company)
        scam_risk = threat.get("scam_risk", "Low")
        risk_notes = threat.get("risk_notes", "")

        classification = {
            "company": company,
            "role": role,
            "status": status,
            "platform": platform,
            "oa_link": link,
            "scam_risk": scam_risk,
            "risk_notes": risk_notes,
            "notes": notes
        }
        email_meta = {
            "email_id": email_id,
            "date_iso": date_iso
        }

        res = upsert_application(email_meta, classification)
        migrated_count += 1
        logger.info("Migrated [%d/%d]: %s (%s) -> %s", migrated_count, len(pages), company, role, res.get("action"))

    total = len(get_all_applications())
    logger.info("Migration finished! Database now contains %d applications.", total)

if __name__ == "__main__":
    migrate()
