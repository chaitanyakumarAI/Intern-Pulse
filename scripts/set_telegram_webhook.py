"""
Register the dashboard's Telegram webhook and the bot's command menu.

Usage:
    python scripts/set_telegram_webhook.py https://<your-app>.vercel.app

Uses TELEGRAM_BOT_TOKEN and (if set) TELEGRAM_WEBHOOK_SECRET from .env. Set the
same TELEGRAM_WEBHOOK_SECRET on Vercel so the webhook accepts Telegram's calls.
"""
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

COMMANDS = [
    ("today", "What needs action now"),
    ("list", "Recent applications"),
    ("stats", "Pipeline numbers"),
    ("status", "Change a status: /status Google Offer"),
    ("scan", "Sync Gmail now"),
    ("quota", "Syncs left today"),
    ("web", "Open the app"),
]


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].startswith("https://"):
        sys.exit("Usage: python scripts/set_telegram_webhook.py https://<your-app>.vercel.app")
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        sys.exit("TELEGRAM_BOT_TOKEN is not set in .env")
    api = f"https://api.telegram.org/bot{token}"

    payload = {"url": sys.argv[1].rstrip("/") + "/api/telegram/webhook", "allowed_updates": ["message"]}
    secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()
    if secret:
        payload["secret_token"] = secret
    print("setWebhook:", requests.post(f"{api}/setWebhook", json=payload, timeout=15).json().get("description"))

    commands = [{"command": c, "description": d} for c, d in COMMANDS]
    print("setMyCommands:", requests.post(f"{api}/setMyCommands", json={"commands": commands}, timeout=15).json().get("ok"))


if __name__ == "__main__":
    main()
