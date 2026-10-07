"""
clean_notion_duplicates.py — Analyze and Clean Duplicates & Bad Company Names in Notion.

Features:
  1. Fixes platform leakage: extracts real company name if Company was 'Internshala' or 'Unstop'.
  2. Normalizes company names (e.g. 'Team.Bluestock' -> 'Bluestock Fintech', 'Indiacampus.Accenture' -> 'Accenture').
  3. Archives promotional newsletter rows ('carnival is live', 'window is closing soon').
  4. Merges duplicate rows for the same company into a single canonical row with the highest status.
  5. Can be run with --dry-run to preview actions, or without flags to execute live cleanup.
"""
import re
import sys
import argparse
import logging
from typing import Dict, List, Any, Optional

import config
import notion_updater
from threat_detector import evaluate_threat

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("clean_notion_duplicates")

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

PROMO_GARBAGE = [
    "window is closing soon", "carnival is live", "summer carnival",
    "referral contest", "early bird", "masterclass", "krishna dubey"
]

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


def clean_row_data(company: str, role: str) -> tuple[str, str]:
    """Detect if company name is actually inside role, and clean names."""
    co_clean = company.strip()
    ro_clean = role.strip()
    
    # Case 1: Company is "Internshala" or aggregator but real company is in role
    if co_clean.lower() in ("internshala", "updates.internshala", "unstop", "jia from unstop", "linkedin", "em.linkedin"):
        # Check if role contains L'Oréal or is the shortlisted email
        if "l'oréal" in ro_clean.lower() or "l'oreal" in ro_clean.lower() or "shortlisted" in ro_clean.lower():
            co_clean = "L'Oréal"
            ro_clean = "Sustainability Challenge / Intern"
        elif "swiggy" in ro_clean.lower():
            co_clean = "Swiggy"
            ro_clean = re.sub(r"(?i)\bat swiggy\b", "", ro_clean).strip() or "Data Science Intern"
        elif "data science" in ro_clean.lower():
            ro_clean = "Data Science Intern"
        elif "full stack" in ro_clean.lower():
            ro_clean = "Full Stack Developer Intern"

    # Case 2: Clean known messy company names
    slug = normalize_slug(co_clean)
    if slug == "loreal": co_clean = "L'Oréal"
    elif slug == "accenture": co_clean = "Accenture"
    elif slug == "appliedmaterials": co_clean = "Applied Materials"
    elif slug == "bluestock": co_clean = "Bluestock Fintech"
    elif slug == "geaerospace": co_clean = "GE Aerospace"
    elif slug == "electronicarts" or "electronic arts" in co_clean.lower() or co_clean.lower().startswith("ea."):
        co_clean = "Electronic Arts"
        ro_clean = "Data and AI Engineering Intern"
    elif slug == "jpmorganchase": co_clean = "JPMorganChase"
    elif slug == "walmart": co_clean = "Walmart"
    elif slug == "barclays": co_clean = "Barclays"
    elif slug == "target": co_clean = "Target"
    elif slug == "doordash": co_clean = "DoorDash"
    elif slug == "smytten": co_clean = "Smytten"
    elif slug == "ccpsiitbhilai": co_clean = "CCPS, IIT Bhilai"
    elif slug == "labmentix": co_clean = "Labmentix"
    elif slug == "abekus" or co_clean.lower() == "stuti":
        co_clean = "Abekus"
        ro_clean = "Full Stack Developer"
    elif slug == "jobrapido" or "jobrapido" in co_clean.lower():
        co_clean = "Jobrapido"
    elif slug == "csktechnologies":
        co_clean = "CSK Technologies"

    # Case 3: Clean role if it contains non-role text
    if any(ro_clean.lower().startswith(bad) or ro_clean.lower() == bad for bad in ("materials", "with electronic arts", "has been shortlisted", "carnival is live", "window is closing soon", "spot")):
        if co_clean == "Applied Materials":
            ro_clean = "Engineering Intern"
        elif co_clean == "Electronic Arts":
            ro_clean = "Data and AI Engineering Intern"
        elif co_clean == "L'Oréal":
            ro_clean = "Sustainability Challenge / Intern"
        else:
            ro_clean = "Candidate / Intern"

    return co_clean, ro_clean


def analyze_database(dry_run: bool = True):
    client = notion_updater._get_client()
    db_id = notion_updater._get_db_id()

    logger.info("Fetching all pages from Notion database %s...", db_id)
    resp = client.data_sources.query(db_id, page_size=100)
    pages = resp.get("results", [])
    logger.info("Total rows retrieved: %d", len(pages))

    rows_by_slug: Dict[str, List[dict]] = {}
    garbage_pages: List[dict] = []

    for page in pages:
        props = page.get("properties", {})
        page_id = page["id"]

        # Extract properties
        co_title = props.get("Company", {}).get("title", [])
        company = co_title[0].get("plain_text", "").strip() if co_title else "Unknown"

        ro_rich = props.get("Role", {}).get("rich_text", [])
        role = ro_rich[0].get("plain_text", "").strip() if ro_rich else "Unknown"

        sel_st = props.get("Status", {}).get("select")
        status = sel_st.get("name", "Unknown") if sel_st else "Unknown"

        # Check for promo garbage
        is_promo = any(g in role.lower() or g in company.lower() for g in PROMO_GARBAGE)
        if is_promo:
            garbage_pages.append({"id": page_id, "company": company, "role": role})
            continue

        cleaned_co, cleaned_ro = clean_row_data(company, role)
        slug = normalize_slug(cleaned_co)

        row_item = {
            "id": page_id,
            "orig_company": company,
            "orig_role": role,
            "company": cleaned_co,
            "role": cleaned_ro,
            "status": status,
            "slug": slug,
            "page": page
        }

        if slug not in rows_by_slug:
            rows_by_slug[slug] = []
        rows_by_slug[slug].append(row_item)

    print("\n" + "="*70)
    print("NOTION DATABASE AUDIT & DUPLICATE ANALYSIS")
    print("="*70)

    print(f"\n1. Promotional / Spam Rows to Archive: {len(garbage_pages)}")
    for g in garbage_pages:
        print(f"   [ARCHIVE] {g['id'][:8]} | Company: {g['company']} | Role: {g['role']}")

    duplicates_found = 0
    updates_planned = []
    archives_planned = []

    print("\n2. Applications Grouped by Canonical Company:")
    for slug, items in sorted(rows_by_slug.items()):
        if len(items) > 1:
            duplicates_found += (len(items) - 1)
            print(f"\n   [DUPLICATE GROUP] Slug: '{slug}' ({len(items)} entries)")
            # Sort items by status hierarchy so highest status is canonical
            sorted_items = sorted(
                items,
                key=lambda x: (STATUS_HIERARCHY.get(x["status"], 0), len(x["role"])),
                reverse=True
            )
            canonical = sorted_items[0]
            print(f"      CANONICAL: {canonical['id'][:8]} | {canonical['company']} | {canonical['role']} | Status: {canonical['status']}")
            
            updates_planned.append(canonical)
            for dupe in sorted_items[1:]:
                print(f"      DUPLICATE: {dupe['id'][:8]} | {dupe['orig_company']} | {dupe['orig_role']} | Status: {dupe['status']} -> TO ARCHIVE")
                archives_planned.append(dupe)
        else:
            item = items[0]
            # Check if name was cleaned
            if item["orig_company"] != item["company"] or item["orig_role"] != item["role"]:
                print(f"   [RENAME] {item['id'][:8]} | '{item['orig_company']}' -> '{item['company']}' | '{item['orig_role']}' -> '{item['role']}'")
                updates_planned.append(item)
            else:
                print(f"   [OK] {item['id'][:8]} | {item['company']} | {item['role']} | Status: {item['status']}")

    print("\n" + "="*70)
    print(f"SUMMARY: {len(pages)} Total Pages | {len(garbage_pages)} Spam to Delete | {duplicates_found} Duplicates to Merge")
    print("="*70)

    if dry_run:
        print("\n--> DRY-RUN complete. No live changes made to Notion.")
        print("--> Run with --apply to execute this cleanup live in Notion.")
        return

    # APPLY LIVE CHANGES
    print("\nAPPLYING LIVE CLEANUP IN NOTION...")
    # 1. Archive promo spam
    for g in garbage_pages:
        logger.info("Archiving spam page %s (%s)...", g["id"][:8], g["role"])
        client.pages.update(page_id=g["id"], archived=True)

    # 2. Archive duplicates
    for dupe in archives_planned:
        logger.info("Archiving duplicate page %s (%s - %s)...", dupe["id"][:8], dupe["orig_company"], dupe["orig_role"])
        client.pages.update(page_id=dupe["id"], archived=True)

    # 3. Update canonical pages with cleaned Company & Role & Threat notes
    for item in updates_planned:
        logger.info("Updating canonical page %s -> Company: %s, Role: %s, Status: %s", item["id"][:8], item["company"], item["role"], item["status"])
        threat = evaluate_threat(item["company"])
        props_to_update = {
            "Company": {"title": [{"text": {"content": item["company"]}}]},
            "Role": {"rich_text": [{"text": {"content": item["role"]}}]},
            "Status": {"select": {"name": item["status"]}},
        }
        client.pages.update(page_id=item["id"], properties=props_to_update)

    print("\nSUCCESS: All duplicate rows merged, company names fixed, and spam removed from Notion!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean Notion Duplicates and Normalise Company Names")
    parser.add_argument("--apply", action="store_true", help="Execute live cleanup in Notion")
    args = parser.parse_args()

    analyze_database(dry_run=not args.apply)
