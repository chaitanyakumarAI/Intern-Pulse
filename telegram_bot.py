"""
telegram_bot.py — Interactive 2-Way Telegram Bot for AI Job Tracker.

Allows you to interact with @InternSlaveBot directly from your phone/desktop:
  /start or /help        — Show available commands and instructions
  /status <co> <status>  — Update job status in Notion (e.g. /status Google Offer)
  /list [limit]          — View recent applications and stages
  /quota                 — View today's remaining Gmail sync quota
  /scan [days]           — Trigger an on-demand Gmail inbox sync
  /stats                 — View pipeline conversion and velocity metrics

Usage:
  .venv\\Scripts\\python.exe telegram_bot.py          # Continuous long-polling daemon
  .venv\\Scripts\\python.exe telegram_bot.py --once   # Poll single update batch & exit
"""
import sys
import time
import json
import logging
import argparse
import threading
from typing import Optional
from datetime import datetime, timezone

# Fix Windows console encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import requests

import config
from config import setup_logging
from sync_quota import can_sync, get_quota, record_sync
import db_manager

logger = setup_logging("telegram_bot")

_BASE_URL = "https://api.telegram.org/bot{token}/{method}"

# Status normalisation table
STATUS_MAP: dict[str, str] = {
    "applied":             "Applied",
    "app":                 "Applied",
    "under review":        "Under Review",
    "review":              "Under Review",
    "reviewing":           "Under Review",
    "oa sent":             "OA Sent",
    "oa":                  "OA Sent",
    "assessment":          "OA Sent",
    "test":                "OA Sent",
    "interview scheduled": "Interview Scheduled",
    "interview":           "Interview Scheduled",
    "round":               "Interview Scheduled",
    "offer":               "Offer",
    "offered":             "Offer",
    "rejected":            "Rejected",
    "reject":              "Rejected",
    "job opportunity":     "Job Opportunity",
    "opp":                 "Job Opportunity",
    "opportunity":         "Job Opportunity",
    "lead":                "Job Opportunity",
    "ghosted":             "Ghosted",
}

STATUS_EMOJI: dict[str, str] = {
    "Applied":             "📝",
    "Under Review":        "🔍",
    "OA Sent":             "💻",
    "Interview Scheduled": "🎯",
    "Offer":               "🎉",
    "Rejected":            "❌",
    "Job Opportunity":     "💼",
    "Ghosted":             "👻",
}


def send_tg_message(chat_id: str | int, text: str, parse_mode: str = "HTML") -> bool:
    """Send a Telegram message to a specific chat ID."""
    token = config.TELEGRAM_BOT_TOKEN
    if not token or token.startswith("your_"):
        logger.warning("TELEGRAM_BOT_TOKEN not configured.")
        return False

    url = _BASE_URL.format(token=token, method="sendMessage")
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }
    try:
        resp = requests.post(url, json=payload, timeout=20)
        resp.raise_for_status()
        return True
    except Exception as exc:
        logger.error("Failed to send Telegram message to %s: %s", chat_id, exc)
        return False


def is_authorized(chat_id: str | int) -> bool:
    """Ensure incoming commands only come from the owner."""
    expected = str(config.TELEGRAM_CHAT_ID).strip()
    actual = str(chat_id).strip()
    if not expected or expected.startswith("your_"):
        return True  # If chat ID not restricted, allow
    return actual == expected


# ── Database Helpers ──────────────────────────────────────────────────────────

def find_job(company_query: str) -> Optional[dict]:
    """Find a recent application matching company_query."""
    match = db_manager.search_applications(company_query)
    if not match:
        return None
    d = match.get("applied_date") or match.get("last_checked") or ""
    return {
        "id": match["id"],
        "company": match.get("company", "Unknown"),
        "role": match.get("role", "Role unspecified"),
        "status": match.get("status", "Applied"),
        "date": d[:10] if d else "",
    }


def fetch_recent_jobs(limit: int = 8) -> list[dict]:
    """Fetch the latest applications from database."""
    apps = db_manager.get_all_applications()
    items = []
    for app in apps[:limit]:
        d = app.get("applied_date") or app.get("last_checked") or ""
        items.append({
            "id": app["id"],
            "company": app.get("company", "Unknown"),
            "role": app.get("role", "Role unspecified"),
            "status": app.get("status", "Applied"),
            "date": d[:10] if d else "",
        })
    return items


def update_status_in_db(page_id: str, new_status: str) -> bool:
    """Update the status of a specific application."""
    return db_manager.update_application_status(page_id, new_status)


# ── Command Handlers ──────────────────────────────────────────────────────────

def handle_help(chat_id: str | int) -> None:
    text = (
        "⚡ <b>InternPulse AI Bot — Command Center</b>\n\n"
        "Here are the commands you can use:\n\n"
        "🔄 <b>/status &lt;Company&gt; &lt;Status&gt;</b>\n"
        "<i>Update application stage in database.</i>\n"
        "Examples:\n"
        "  • <code>/status Google Interview</code>\n"
        "  • <code>/status Microsoft Offer</code>\n"
        "  • <code>/status Amazon OA</code>\n"
        "  • <code>/status Meta Rejected</code>\n\n"
        "📋 <b>/list [limit]</b>\n"
        "<i>View your recent applications and current stages.</i>\n\n"
        "⚡ <b>/scan [days]</b>\n"
        "<i>Trigger a Gmail inbox scan (e.g. <code>/scan 7</code>).</i>\n\n"
        "⏱️ <b>/quota</b>\n"
        "<i>Check today's remaining sync limit and reset time.</i>\n\n"
        "📊 <b>/stats</b>\n"
        "<i>View active pipeline breakdown and response velocity.</i>\n\n"
        "❓ <b>/help</b> — Show this command reference."
    )
    send_tg_message(chat_id, text)


def handle_quota(chat_id: str | int) -> None:
    quota = get_quota()
    used = quota["syncs_today"]
    limit = quota["daily_limit"]
    rem = quota["remaining"]
    resets_at = quota.get("resets_at", "00:00 UTC")
    last_sync = quota.get("last_sync_time")
    if last_sync:
        try:
            last_sync_str = datetime.fromisoformat(last_sync).strftime("%b %d, %H:%M UTC")
        except Exception:
            last_sync_str = last_sync[:16]
    else:
        last_sync_str = "No sync recorded today"

    pct = int((used / limit) * 100) if limit > 0 else 0
    bar = "█" * (pct // 10) + "░" * (10 - (pct // 10))

    text = (
        "⏱️ <b>Daily Gmail Sync Quota</b>\n\n"
        f"<b>Used Today:</b> {used} / {limit} ({pct}%)\n"
        f"<b>Remaining:</b> <b>{rem} syncs</b>\n"
        f"<b>Progress:</b> <code>[{bar}]</code>\n"
        f"<b>Last Sync:</b> {last_sync_str}\n"
        f"<b>Resets At:</b> {resets_at}\n\n"
        f"<i>To start a sync, send <code>/scan</code></i>"
    )
    send_tg_message(chat_id, text)


def handle_status(chat_id: str | int, args_text: str) -> None:
    parts = args_text.strip().split()
    if len(parts) < 2:
        send_tg_message(
            chat_id,
            "⚠️ <b>Usage:</b> <code>/status &lt;Company&gt; &lt;New Status&gt;</code>\n\n"
            "Examples:\n"
            "  • <code>/status Google Interview</code>\n"
            "  • <code>/status Microsoft Offer</code>\n"
            "  • <code>/status Stripe OA</code>"
        )
        return

    # Check for multi-word status at the end (e.g. "Under Review", "OA Sent", "Interview Scheduled")
    company_input = ""
    target_status = ""

    joined_lower = " ".join(parts).lower()
    for raw_key, canon in STATUS_MAP.items():
        if joined_lower.endswith(raw_key):
            target_status = canon
            # remove suffix
            suffix_len = len(raw_key.split())
            company_input = " ".join(parts[:-suffix_len]).strip()
            break

    if not target_status:
        # Fallback: assume last word is status
        status_candidate = parts[-1].lower()
        company_input = " ".join(parts[:-1]).strip()
        target_status = STATUS_MAP.get(status_candidate, parts[-1].title())

    if not company_input:
        send_tg_message(chat_id, "⚠️ Please specify a company name. Example: <code>/status Google Offer</code>")
        return

    send_tg_message(chat_id, f"🔍 Searching database for <b>{company_input}</b>...")
    job = find_job(company_input)
    if not job:
        send_tg_message(
            chat_id,
            f"❌ Could not find an application matching <b>{company_input}</b>.\n"
            f"Use <code>/list</code> to verify company names in your pipeline."
        )
        return

    prev_status = job.get("status") or "Applied"
    success = update_status_in_db(job["id"], target_status)
    if success:
        emoji = STATUS_EMOJI.get(target_status, "✅")
        text = (
            f"{emoji} <b>Application Status Updated!</b>\n\n"
            f"🏢 <b>Company:</b> {job['company']}\n"
            f"💼 <b>Role:</b> {job['role']}\n"
            f"🔄 <b>Stage:</b> <s>{prev_status}</s> ➔ <b>{target_status}</b>\n\n"
            f"<i>Synchronized live with cloud database.</i>"
        )
    else:
        text = f"❌ Failed to update <b>{job['company']}</b> in database. Check logs."

    send_tg_message(chat_id, text)


def handle_list(chat_id: str | int, args_text: str) -> None:
    limit = 8
    if args_text.strip().isdigit():
        limit = min(int(args_text.strip()), 15)

    jobs = fetch_recent_jobs(limit=limit)
    if not jobs:
        send_tg_message(chat_id, "📋 No applications found in database.")
        return

    lines = [f"📋 <b>Active Applications ({len(jobs)} latest):</b>\n"]
    for i, j in enumerate(jobs, 1):
        status = j["status"]
        emoji = STATUS_EMOJI.get(status, "📌")
        date_str = f" • <i>{j['date']}</i>" if j.get("date") else ""
        lines.append(
            f"{i}. {emoji} <b>{j['company']}</b> — {j['role']}\n"
            f"   Stage: <code>{status}</code>{date_str}"
        )

    lines.append("\n<i>To change a status, use <code>/status &lt;Company&gt; &lt;Status&gt;</code></i>")
    send_tg_message(chat_id, "\n".join(lines))


def handle_stats(chat_id: str | int) -> None:
    jobs = fetch_recent_jobs(limit=50)
    if not jobs:
        send_tg_message(chat_id, "📊 No application data found to calculate metrics.")
        return

    counts: dict[str, int] = {}
    for j in jobs:
        s = j["status"]
        counts[s] = counts.get(s, 0) + 1

    total = len(jobs)
    interviews = counts.get("Interview Scheduled", 0)
    offers = counts.get("Offer", 0)
    oas = counts.get("OA Sent", 0)
    applied = counts.get("Applied", 0)
    review = counts.get("Under Review", 0)
    rejected = counts.get("Rejected", 0)

    tracked = total - counts.get("Job Opportunity", 0)
    response_rate = int(((tracked - applied) / tracked * 100)) if tracked > 0 else 0

    text = (
        "📊 <b>Career Pipeline Velocity</b>\n\n"
        f"📁 <b>Total Applications:</b> {total}\n"
        f"📝 <b>Applied:</b> {applied}\n"
        f"🔍 <b>Under Review:</b> {review}\n"
        f"💻 <b>OA Assessments:</b> {oas}\n"
        f"🎯 <b>Interviews:</b> {interviews}\n"
        f"🎉 <b>Offers:</b> {offers}\n"
        f"❌ <b>Rejected:</b> {rejected}\n\n"
        f"🚀 <b>Response Rate:</b> <b>{response_rate}%</b>"
    )
    send_tg_message(chat_id, text)


def _execute_scan_worker(chat_id: str | int, days: Optional[str]) -> None:
    """Worker thread running Gmail sync."""
    try:
        from main import run_once
        stats = run_once(days=days)
        p = stats.get("processed", 0)
        c = stats.get("created", 0)
        u = stats.get("updated", 0)
        quota = get_quota()

        text = (
            "✅ <b>Gmail Inbox Scan Complete!</b>\n\n"
            f"📧 <b>Emails Processed:</b> {p}\n"
            f"🆕 <b>New Applications:</b> {c}\n"
            f"🔄 <b>Stages Updated:</b> {u}\n"
            f"⏱️ <b>Quota Left Today:</b> {quota['remaining']} / {quota['daily_limit']}\n\n"
            f"<i>Check your Notion or Web Dashboard for real-time cards.</i>"
        )
        send_tg_message(chat_id, text)
    except Exception as exc:
        logger.error("Scan worker failed: %s", exc)
        send_tg_message(chat_id, f"❌ Scan encountered an error: {exc}")


def handle_scan(chat_id: str | int, args_text: str) -> None:
    allowed, quota = can_sync()
    if not allowed:
        resets_at = quota.get("resets_at", "00:00 UTC")
        send_tg_message(
            chat_id,
            f"🛑 <b>Daily Sync Limit Reached!</b>\n\n"
            f"You have used <b>{quota['syncs_today']} / {quota['daily_limit']}</b> syncs today.\n"
            f"Your daily quota resets at <b>{resets_at}</b>."
        )
        return

    days_param: Optional[str] = None
    arg = args_text.strip()
    if arg and arg.isdigit():
        days_param = arg

    horizon_label = f"the last {days_param} days" if days_param else "all recent unread emails"
    send_tg_message(
        chat_id,
        f"⚡ <b>Initiating Gmail Sync...</b>\n"
        f"Scanning {horizon_label}.\n"
        f"<i>Quota used: {quota['syncs_today'] + 1} / {quota['daily_limit']}</i>\n"
        f"Live updates will appear shortly."
    )

    thread = threading.Thread(
        target=_execute_scan_worker,
        args=(chat_id, days_param),
        daemon=True,
    )
    thread.start()


# ── Update Processing Dispatcher ──────────────────────────────────────────────

def process_update(update: dict) -> None:
    message = update.get("message") or update.get("edited_message")
    if not message or "text" not in message:
        return

    chat_id = message.get("chat", {}).get("id")
    text = message.get("text", "").strip()

    if not is_authorized(chat_id):
        logger.warning("Unauthorized access attempt from chat_id %s: %s", chat_id, text)
        send_tg_message(chat_id, "⛔ <b>Unauthorized.</b> This bot is restricted to its owner.")
        return

    logger.info("Received command from %s: '%s'", chat_id, text)

    # Command routing
    cmd_token = text.split()[0].lower() if text else ""
    # Strip @botname suffix if used in groups (e.g. /status@InternSlaveBot)
    cmd = cmd_token.split("@")[0]
    args = text[len(cmd_token):].strip()

    if cmd in ("/start", "/help"):
        handle_help(chat_id)
    elif cmd in ("/quota", "/limit"):
        handle_quota(chat_id)
    elif cmd in ("/status", "/update"):
        handle_status(chat_id, args)
    elif cmd in ("/list", "/pipeline", "/jobs"):
        handle_list(chat_id, args)
    elif cmd in ("/stats", "/metrics"):
        handle_stats(chat_id)
    elif cmd in ("/scan", "/sync"):
        handle_scan(chat_id, args)
    else:
        send_tg_message(
            chat_id,
            f"❓ Unrecognized command: <code>{text}</code>\n"
            f"Send <code>/help</code> for available commands."
        )


# ── Long-Polling Loop ──────────────────────────────────────────────────────────

def run_polling(timeout: int = 20, once: bool = False) -> None:
    token = config.TELEGRAM_BOT_TOKEN
    if not token or token.startswith("your_"):
        logger.error("TELEGRAM_BOT_TOKEN is not configured in .env. Exiting.")
        return

    url = _BASE_URL.format(token=token, method="getUpdates")
    logger.info("=" * 60)
    logger.info("InternPulse 2-Way Telegram Bot listening...")
    logger.info("Bot Token: %s...", token[:12])
    logger.info("Authorized Chat ID: %s", config.TELEGRAM_CHAT_ID)
    logger.info("=" * 60)

    offset: Optional[int] = None
    consecutive_errors = 0

    while True:
        params: dict = {"timeout": timeout, "allowed_updates": ["message"]}
        if offset is not None:
            params["offset"] = offset

        try:
            resp = requests.get(url, params=params, timeout=timeout + 10)
            if resp.status_code == 200:
                consecutive_errors = 0
                data = resp.json()
                updates = data.get("result", [])
                for u in updates:
                    offset = u["update_id"] + 1
                    try:
                        process_update(u)
                    except Exception as err:
                        logger.error("Error processing update: %s", err, exc_info=True)
            elif resp.status_code == 409:
                logger.warning("Conflict: another webhook or bot instance is active. Sleeping 10s...")
                time.sleep(10)
            else:
                logger.error("Telegram getUpdates returned HTTP %d: %s", resp.status_code, resp.text)
                consecutive_errors += 1
                time.sleep(min(2 ** consecutive_errors, 30))
        except requests.RequestException as exc:
            consecutive_errors += 1
            logger.warning("Network issue reaching Telegram API: %s (backing off...)", exc)
            time.sleep(min(2 ** consecutive_errors, 20))
        except KeyboardInterrupt:
            logger.info("Telegram Bot stopped by user (Ctrl+C).")
            break

        if once:
            logger.info("Single polling batch complete (--once).")
            break


def clear_webhook() -> bool:
    """Delete any active webhook so long-polling getUpdates works."""
    token = config.TELEGRAM_BOT_TOKEN
    if not token:
        return False
    url = _BASE_URL.format(token=token, method="deleteWebhook")
    try:
        resp = requests.post(url, timeout=15)
        logger.info("Cleared webhook: %s", resp.json())
        return resp.ok
    except Exception as exc:
        logger.error("Failed to delete webhook: %s", exc)
        return False


def set_webhook(url: str) -> bool:
    """Set a Telegram webhook URL."""
    token = config.TELEGRAM_BOT_TOKEN
    if not token:
        return False
    endpoint = _BASE_URL.format(token=token, method="setWebhook")
    try:
        resp = requests.post(endpoint, json={"url": url}, timeout=15)
        logger.info("Set webhook to %s: %s", url, resp.json())
        return resp.ok
    except Exception as exc:
        logger.error("Failed to set webhook: %s", exc)
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="InternPulse Interactive 2-Way Telegram Bot")
    parser.add_argument("--once", action="store_true", help="Poll for pending updates once and exit")
    parser.add_argument("--timeout", type=int, default=20, help="Long polling timeout in seconds (default 20)")
    parser.add_argument("--clear-webhook", action="store_true", help="Delete active webhook so long-polling can connect")
    parser.add_argument("--set-webhook", type=str, help="Register a webhook URL with Telegram and exit")
    args = parser.parse_args()

    if args.set_webhook:
        set_webhook(args.set_webhook)
        return

    if args.clear_webhook:
        clear_webhook()

    run_polling(timeout=args.timeout, once=args.once)


if __name__ == "__main__":
    main()
