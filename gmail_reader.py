"""
gmail_reader.py — Gmail API authentication and email fetching.

First run will open a browser for OAuth consent.
After that, the token is cached in token.json for silent re-use.
"""
import base64
import logging
import json
from pathlib import Path
from typing import Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

import config
from utils import html_to_text, clean_text, parse_email_date, make_email_id, retry

logger = logging.getLogger(__name__)


# ── Authentication ────────────────────────────────────────────────────────────

def get_gmail_service():
    """
    Return an authenticated Gmail API service object.
    Handles token refresh and first-time OAuth flow automatically.
    """
    creds: Optional[Credentials] = None

    # Load cached token if it exists
    if config.GMAIL_TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(
                str(config.GMAIL_TOKEN_FILE), config.GMAIL_SCOPES
            )
        except Exception as exc:
            logger.warning("Could not load cached token: %s", exc)
            creds = None

    # Refresh or re-authenticate
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                logger.info("Gmail token refreshed successfully.")
            except Exception as exc:
                logger.warning("Token refresh failed (%s); re-authenticating.", exc)
                creds = None

        if not creds:
            if not config.GMAIL_CREDENTIALS_FILE.exists():
                raise FileNotFoundError(
                    f"Gmail credentials file not found: {config.GMAIL_CREDENTIALS_FILE}\n"
                    "Download it from Google Cloud Console → APIs & Services → Credentials."
                )
            flow = InstalledAppFlow.from_client_secrets_file(
                str(config.GMAIL_CREDENTIALS_FILE), config.GMAIL_SCOPES
            )
            creds = flow.run_local_server(port=0)
            logger.info("Gmail OAuth flow completed.")

        # Cache token
        with open(config.GMAIL_TOKEN_FILE, "w") as token_file:
            token_file.write(creds.to_json())
        logger.info("Gmail token saved to %s", config.GMAIL_TOKEN_FILE)

    service = build("gmail", "v1", credentials=creds)
    logger.info("Gmail service authenticated ✓")
    return service


# ── Message fetching ──────────────────────────────────────────────────────────

@retry(max_attempts=3, delay=2.0)
def fetch_messages(service, max_results: int = None) -> list[dict]:
    """
    Fetch the latest `max_results` emails from the inbox.
    Returns a list of parsed email dicts.
    """
    if max_results is None:
        max_results = config.GMAIL_MAX_RESULTS

    logger.info("Fetching up to %d messages from Gmail…", max_results)

    try:
        result = (
            service.users()
            .messages()
            .list(userId="me", maxResults=max_results, labelIds=["INBOX"])
            .execute()
        )
    except HttpError as exc:
        logger.error("Gmail API list error: %s", exc)
        raise

    message_refs = result.get("messages", [])
    if not message_refs:
        logger.info("No messages found in inbox.")
        return []

    emails = []
    for ref in message_refs:
        parsed = _parse_message(service, ref["id"])
        if parsed:
            emails.append(parsed)

    logger.info("Fetched and parsed %d messages.", len(emails))
    return emails


def _parse_message(service, msg_id: str) -> Optional[dict]:
    """Fetch a single message by ID and return a structured dict."""
    try:
        msg = (
            service.users()
            .messages()
            .get(userId="me", id=msg_id, format="full")
            .execute()
        )
    except HttpError as exc:
        logger.warning("Could not fetch message %s: %s", msg_id, exc)
        return None

    headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}

    subject = headers.get("Subject", "(no subject)")
    sender  = headers.get("From", "")
    date_str = headers.get("Date", "")
    date_iso = parse_email_date(date_str)

    body = _extract_body(msg.get("payload", {}))
    snippet = msg.get("snippet", "")

    email_id = make_email_id(sender, subject, date_str)

    return {
        "id": msg_id,
        "email_id": email_id,   # stable dedup key
        "subject": subject,
        "sender": sender,
        "date_raw": date_str,
        "date_iso": date_iso,
        "body": clean_text(body or snippet),
        "snippet": snippet,
    }


def _extract_body(payload: dict) -> str:
    """
    Recursively extract plain-text or HTML body from a Gmail message payload.
    Prefers text/plain; falls back to text/html decoded to plain text.
    """
    mime = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data", "")

    if mime == "text/plain" and body_data:
        return base64.urlsafe_b64decode(body_data + "==").decode("utf-8", errors="replace")

    if mime == "text/html" and body_data:
        raw_html = base64.urlsafe_b64decode(body_data + "==").decode("utf-8", errors="replace")
        return html_to_text(raw_html)

    # Multipart — recurse into parts
    for part in payload.get("parts", []):
        text = _extract_body(part)
        if text:
            return text

    return ""
