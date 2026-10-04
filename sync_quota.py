"""
sync_quota.py — Enforces and tracks daily Gmail sync limits for InternPulse.

Persists quota state to data/sync_quota.json and automatically resets
when the calendar day rolls over (UTC).
"""
import os
import json
import logging
from pathlib import Path
from datetime import datetime, timezone
import config

logger = logging.getLogger("sync_quota")

QUOTA_FILE: Path = config.DATA_DIR / "sync_quota.json"


def _get_today_str() -> str:
    """Return today's date formatted as YYYY-MM-DD (UTC)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def get_daily_limit() -> int:
    """Read configured daily sync limit from config or env."""
    return getattr(config, "DAILY_SYNC_LIMIT", 5)


def get_quota(daily_limit: int | None = None) -> dict:
    """
    Retrieve current quota status, automatically rolling over if the date has changed.
    """
    limit = daily_limit if daily_limit is not None else get_daily_limit()
    today = _get_today_str()

    default_quota = {
        "date": today,
        "syncs_today": 0,
        "daily_limit": limit,
        "remaining": limit,
        "last_sync_time": None,
        "resets_at": "00:00 UTC",
    }

    if not QUOTA_FILE.exists():
        _save_quota(default_quota)
        return default_quota

    try:
        with open(QUOTA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Check for calendar day rollover
        if data.get("date") != today:
            logger.info("New day detected (%s != %s). Resetting daily sync quota.", data.get("date"), today)
            data["date"] = today
            data["syncs_today"] = 0
            data["daily_limit"] = limit
            data["remaining"] = limit
            data["resets_at"] = "00:00 UTC"
            _save_quota(data)
            return data

        # Keep daily_limit up to date if config changed
        data["daily_limit"] = limit
        data["remaining"] = max(0, limit - int(data.get("syncs_today", 0)))
        data["resets_at"] = "00:00 UTC"
        return data

    except Exception as exc:
        logger.warning("Error reading sync quota file: %s. Re-initialising default quota.", exc)
        _save_quota(default_quota)
        return default_quota


def can_sync(daily_limit: int | None = None) -> tuple[bool, dict]:
    """
    Check if a sync is allowed today.
    Returns (is_allowed, quota_dict).
    """
    quota = get_quota(daily_limit)
    allowed = quota["remaining"] > 0
    return allowed, quota


def record_sync(daily_limit: int | None = None) -> dict:
    """
    Increment today's sync count and update timestamp.
    Returns updated quota dict.
    """
    quota = get_quota(daily_limit)
    quota["syncs_today"] = int(quota.get("syncs_today", 0)) + 1
    quota["remaining"] = max(0, quota["daily_limit"] - quota["syncs_today"])
    quota["last_sync_time"] = datetime.now(timezone.utc).isoformat()

    _save_quota(quota)
    logger.info("Recorded sync: %d/%d used today (%d remaining).",
                quota["syncs_today"], quota["daily_limit"], quota["remaining"])
    return quota


def _save_quota(data: dict) -> None:
    """Write quota data atomically to data/sync_quota.json."""
    try:
        QUOTA_FILE.parent.mkdir(exist_ok=True)
        temp_file = QUOTA_FILE.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        temp_file.replace(QUOTA_FILE)
    except Exception as exc:
        logger.error("Failed to write sync quota file: %s", exc)


if __name__ == "__main__":
    allowed, q = can_sync()
    print(f"Can sync today: {allowed}")
    print(json.dumps(q, indent=2))
