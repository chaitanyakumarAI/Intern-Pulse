"""
telegram_notifier.py — Send job application status alerts via Telegram Bot API.
"""
import logging
import requests

import config
from utils import retry, truncate

logger = logging.getLogger(__name__)

_TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"

# ── Emoji mapping ─────────────────────────────────────────────────────────────
_STATUS_EMOJI = {
    "Applied":              "📝",
    "Under Review":         "🔍",
    "OA Sent":              "💻",
    "Interview Scheduled":  "🎯",
    "Rejected":             "❌",
    "Offer":                "🎉",
    "Ghosted":              "👻",
    "Unknown":              "❓",
}


def _is_configured() -> bool:
    token = config.TELEGRAM_BOT_TOKEN
    chat  = config.TELEGRAM_CHAT_ID
    return bool(token and chat
                and not token.startswith("your_")
                and not chat.startswith("your_"))


@retry(max_attempts=3, delay=2.0, exceptions=(requests.RequestException,))
def send_message(text: str) -> bool:
    """
    Send a raw text message. Returns True on success.
    Silently skips if Telegram is not configured.
    """
    if not _is_configured():
        logger.debug("Telegram not configured — skipping notification.")
        return False

    url = _TELEGRAM_API.format(token=config.TELEGRAM_BOT_TOKEN)
    payload = {
        "chat_id":    config.TELEGRAM_CHAT_ID,
        "text":       text,
        "parse_mode": "HTML",
    }
    try:
        resp = requests.post(url, json=payload, timeout=20)
        resp.raise_for_status()
        logger.info("Telegram message sent ✓")
        return True
    except requests.RequestException as exc:
        logger.error("Telegram send failed: %s", exc)
        raise


def notify_status_change(
    email: dict,
    classification: dict,
    action: str = "created",
) -> bool:
    """
    Build and send a notification for a status change.
    Only fires for statuses listed in config.NOTIFY_STATUSES.
    """
    status = classification.get("status", "Unknown")

    if status not in config.NOTIFY_STATUSES:
        return False

    emoji   = _STATUS_EMOJI.get(status, "📌")
    company = classification.get("company", "Unknown")
    role    = classification.get("role", "Unknown")
    subject = truncate(email.get("subject", ""), 80)
    # Parse date to show time too (e.g. 2026-05-13 14:30 UTC)
    date_raw = email.get("date_raw", "")
    date_iso = email.get("date_iso", "")[:16].replace("T", " ") + " UTC"
    
    if action == "created":
        action_line = "🆕 <b>New application tracked</b>"
    elif action == "opportunity":
        action_line = "🔥 <b>Hot Job Recommendation Found!</b>"
        emoji = "💼"
    else:
        action_line = "🔄 <b>Status updated</b>"

    oa_line = ""
    if classification.get("oa_link"):
        oa_line = f"\n🔗 <b>OA Link:</b> {classification['oa_link']}"

    notes = classification.get("notes", "")
    notes_line = f"\n📌 <i>{notes}</i>" if notes and notes != "(classified by keyword fallback)" else ""

    scam_risk = classification.get("scam_risk", "Unknown")
    scam_emoji = "⚠️" if scam_risk in ("High", "Medium") else "✅"
    risk_notes = classification.get("risk_notes", "")
    scam_line = ""
    if scam_risk != "Unknown":
        scam_line = f"\n\n{scam_emoji} <b>Risk Assessment:</b> {scam_risk}\n<i>{risk_notes}</i>"

    prep_sheet = classification.get("prep_sheet", "")
    prep_line = ""
    if prep_sheet:
        prep_line = f"\n\n🧠 <b>Interview Prep Sheet:</b>\n{prep_sheet}"

    message = (
        f"{action_line}\n"
        f"\n{emoji} <b>Status:</b> {status}"
        f"\n🏢 <b>Company:</b> {company}"
        f"\n💼 <b>Role:</b> {role}"
        f"\n📧 <b>Subject:</b> {subject}"
        f"\n📅 <b>Time:</b> {date_iso}"
        f"{oa_line}"
        f"{notes_line}"
        f"{scam_line}"
        f"{prep_line}"
    )

    return send_message(message)


def notify_summary(stats: dict) -> bool:
    """
    Send a run summary message.
    stats: {processed, created, updated, skipped, errors}
    """
    msg = (
        f"📊 <b>AI Job Tracker — Run Summary</b>\n"
        f"\n✅ Processed: {stats.get('processed', 0)} emails"
        f"\n🆕 Created:   {stats.get('created', 0)} new rows"
        f"\n🔄 Updated:   {stats.get('updated', 0)} rows"
        f"\n⏭️  Skipped:   {stats.get('skipped', 0)}"
        f"\n❌ Errors:    {stats.get('errors', 0)}"
    )
    return send_message(msg)
