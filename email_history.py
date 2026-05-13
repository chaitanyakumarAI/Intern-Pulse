"""
email_history.py — Persistent tracking of already-processed Gmail message IDs.

Stores processed IDs in data/processed_emails.json so that re-runs never
re-process emails that have already been classified and inserted into Notion.

Format of processed_emails.json:
{
  "processed_ids": ["<gmail_msg_id_1>", "<gmail_msg_id_2>", ...],
  "last_updated": "2026-05-13T08:00:00.000Z",
  "total_processed": 42
}
"""
import json
import logging
from pathlib import Path
from typing import Set

import config
from utils import now_iso

logger = logging.getLogger(__name__)

_HISTORY_FILE: Path = config.DATA_DIR / "processed_emails.json"


def _load() -> dict:
    """Load the history file. Returns empty structure if missing or corrupt."""
    if not _HISTORY_FILE.exists():
        return {"processed_ids": [], "last_updated": None, "total_processed": 0}
    try:
        with open(_HISTORY_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data.get("processed_ids"), list):
            raise ValueError("Invalid format")
        return data
    except Exception as exc:
        logger.warning("Could not load email history (%s); starting fresh.", exc)
        return {"processed_ids": [], "last_updated": None, "total_processed": 0}


def _save(data: dict) -> None:
    """Atomically write history to disk."""
    data["last_updated"] = now_iso()
    try:
        _HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = _HISTORY_FILE.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        tmp.replace(_HISTORY_FILE)
    except Exception as exc:
        logger.error("Failed to save email history: %s", exc)


def get_processed_ids() -> Set[str]:
    """Return the set of already-processed Gmail message IDs."""
    data = _load()
    return set(data["processed_ids"])


def mark_processed(gmail_ids: list[str]) -> None:
    """Add one or more Gmail message IDs to the processed set."""
    if not gmail_ids:
        return
    data = _load()
    existing = set(data["processed_ids"])
    new_ids = [gid for gid in gmail_ids if gid not in existing]
    if new_ids:
        data["processed_ids"].extend(new_ids)
        data["total_processed"] = len(data["processed_ids"])
        _save(data)
        logger.debug("Marked %d new message IDs as processed.", len(new_ids))


def is_processed(gmail_id: str) -> bool:
    """Return True if this Gmail message ID has already been handled."""
    return gmail_id in get_processed_ids()


def get_stats() -> dict:
    """Return summary stats about the history store."""
    data = _load()
    return {
        "total_processed": data.get("total_processed", len(data["processed_ids"])),
        "last_updated": data.get("last_updated", "never"),
        "file": str(_HISTORY_FILE),
    }


def clear_history() -> None:
    """Reset the history file (use with caution — all emails will be re-processed)."""
    if _HISTORY_FILE.exists():
        _HISTORY_FILE.unlink()
        logger.warning("Email history cleared. All emails will be re-processed on next run.")
