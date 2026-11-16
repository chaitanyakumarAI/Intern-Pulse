"""
recheck.py — Re-check "Needs Review" applications with Gemini.

Rows land in "Needs Review" when the classifier wasn't sure, and older versions also
stored keyword guesses made while Gemini was down (job alerts and newsletters saved
as applications). This re-reads each row's original email and asks Gemini again:

  job digest            -> move it to the Radar (opportunities) and remove the row
  not a job email       -> remove the row
  a real status         -> update status, company and role
  still unsure / no AI  -> leave the row untouched

Only rows with a stored Gmail message ID can be re-checked. Nothing is removed on
a keyword guess: if Gemini doesn't answer, the row stays as it is.
"""
import logging
from collections import Counter
from typing import Optional

import cloud_state
import db_manager
import gmail_reader
import status_classifier

logger = logging.getLogger(__name__)

UNSURE = {"Needs Review", "Unknown"}


def _plan_one(row: dict, email: Optional[dict]) -> dict:
    """Decide what to do with one row. Pure apart from the Gemini call."""
    item = {"id": row["id"], "company": row["company"], "action": "keep", "reason": ""}
    if not email:
        item["reason"] = "original email not found"
        return item

    result = status_classifier.classify_email_ai(email)
    method = result.get("method")
    if method == "keyword":
        item["reason"] = "Gemini unavailable"
        return item
    if method == "skipped":
        item.update(action="delete", reason="not a job application")
        return item

    status = result.get("status") or "Unknown"
    company = result.get("company") or "Unknown"
    if status == "Job Opportunity" and company != "Unknown":
        item.update(action="move_to_radar", reason="job alert", classification=result)
    elif status in UNSURE or company == "Unknown":
        item["reason"] = "Gemini is unsure too"
    else:
        item.update(action="update", reason=status, classification=result, email=email,
                    new_status=status, new_company=company)
    return item


def _apply(item: dict, row: dict) -> bool:
    action = item["action"]
    if action == "delete":
        return db_manager.delete_application(row["id"])
    if action == "move_to_radar":
        if cloud_state.available():
            cloud_state.save_opportunity(item["classification"])
        return db_manager.delete_application(row["id"])
    if action == "update":
        cls = item["classification"]
        new_slug = db_manager.normalize_slug(cls["company"])
        if new_slug == row["company_slug"]:
            return db_manager.update_application_fields(row["id"], {
                "status": cls["status"],
                "company": cls["company"],
                "role": cls.get("role") or row.get("role"),
            })
        # The real company differs: fold the update into that company's row (or create it).
        db_manager.upsert_application(item["email"], cls)
        return db_manager.delete_application(row["id"])
    return False


def recheck_needs_review(apply: bool = False, limit: int = 50) -> dict:
    """
    Re-check up to `limit` "Needs Review" rows. With apply=False nothing is changed
    and the plan is returned. Returns {"checked", "counts", "items"}.
    """
    rows = db_manager.list_needs_review(limit)
    status_classifier.reset_gemini_session()
    service = gmail_reader.get_gmail_service() if rows else None

    items, counts = [], Counter()
    for row in rows:
        email = gmail_reader.fetch_message(service, row["last_gmail_id"])
        item = _plan_one(row, email)
        if apply and item["action"] != "keep":
            if not _apply(item, row):
                item.update(action="keep", reason="write failed")
        counts[item["action"]] += 1
        items.append({k: item.get(k) for k in ("company", "action", "reason", "new_status", "new_company")})
        logger.info("Re-check %s: %s (%s)", row["company"], item["action"], item["reason"])
    return {"checked": len(rows), "applied": apply, "counts": dict(counts), "items": items}
