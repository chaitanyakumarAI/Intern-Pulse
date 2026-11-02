"""
server.py — The InternPulse sync worker (Render web service).

Runs the pipeline on request. It never starts a sync by itself: the GitHub Actions
cron and the app's "Sync" button decide when, so waking the worker costs nothing.

Endpoints:
  GET  /, /health, /api/health -> status, quota and which services are configured
  GET  /api/quota              -> today's sync quota
  POST /api/sync               -> start a sync in the background (202)
                                  ?days=N   only emails from the last N days
                                  ?force=true  bypass the daily limit (token required)
                                  ?trigger=app|schedule|telegram  recorded with the run

If SYNC_API_TOKEN is set, /api/sync requires "Authorization: Bearer <token>".
"""
import hmac
import json
import os
import threading
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import cloud_state
import config
from config import setup_logging
from sync_quota import can_sync, get_quota

logger = setup_logging("server")

SYNC_API_TOKEN = os.environ.get("SYNC_API_TOKEN", "").strip()
VALID_TRIGGERS = {"manual", "app", "schedule", "telegram"}

_sync_lock = threading.Lock()
_last_sync_time = None
_last_sync_status = "idle"
_last_sync_stats = None


def _token_status(headers) -> str:
    """Return 'valid', 'missing' or 'invalid' for the request's bearer token."""
    auth = headers.get("Authorization", "")
    supplied = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not SYNC_API_TOKEN or not supplied:
        return "missing"
    return "valid" if hmac.compare_digest(supplied, SYNC_API_TOKEN) else "invalid"


def _parse_days(value: str | None) -> str | None:
    """Accept a positive whole number of days (the dashboard's time window), else None."""
    value = (value or "").strip()
    return value if value.isdigit() and 0 < int(value) <= 3650 else None


def _configured() -> dict:
    """Which services are set up (booleans only, never values)."""
    def is_set(value) -> bool:
        return bool(value) and not str(value).startswith("your_")
    return {
        "gmail": config.GMAIL_TOKEN_FILE.exists() or is_set(os.getenv("GMAIL_TOKEN_JSON")),
        "gemini": is_set(config.GEMINI_API_KEY),
        "database": is_set(config.SUPABASE_URL) and is_set(config.SUPABASE_KEY),
        "cloud_state": cloud_state.available(),
        "telegram": is_set(config.TELEGRAM_BOT_TOKEN) and is_set(config.TELEGRAM_CHAT_ID),
        "sync_token": bool(SYNC_API_TOKEN),
    }


def _run_worker_sync(force: bool = False, days: str | None = None, trigger: str = "manual") -> dict:
    """Execute one pipeline sync (called in a background thread)."""
    global _last_sync_time, _last_sync_status, _last_sync_stats
    if not _sync_lock.acquire(blocking=False):
        return {"status": "already_running"}
    try:
        allowed, quota = can_sync()
        if not allowed and not force:
            _last_sync_status = "quota_exceeded"
            logger.warning("Sync skipped: daily limit reached (%d/%d).", quota["syncs_today"], quota["daily_limit"])
            return {"status": "quota_exceeded", "quota": quota}

        _last_sync_status = "running"
        logger.info("Starting sync (trigger=%s, days=%s, force=%s)", trigger, days, force)
        try:
            from main import run_once
            stats = run_once(days=days, force=force, trigger=trigger) or {}
            _last_sync_stats = {k: v for k, v in stats.items() if isinstance(v, int)}
            _last_sync_time = datetime.now(timezone.utc).isoformat()
            _last_sync_status = {"limit_reached": "quota_exceeded", "already_running": "idle"}.get(stats.get("status"), "success")
            return {"status": _last_sync_status, "completed_at": _last_sync_time}
        except Exception as exc:
            _last_sync_status = f"failed: {exc}"
            logger.error("Sync failed: %s", exc, exc_info=True)
            return {"status": "error", "error": str(exc)}
    finally:
        _sync_lock.release()


class HealthAndSyncHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, data: dict):
        payload = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def _start_sync(self, parsed):
        token = _token_status(self.headers)
        if SYNC_API_TOKEN and token != "valid":
            self._send_json(401, {"error": "Unauthorized"})
            return
        params = parse_qs(parsed.query)
        force = token == "valid" and params.get("force", ["false"])[0].lower() in ("true", "1", "yes")
        days = _parse_days(params.get("days", [None])[0])
        trigger = params.get("trigger", ["manual"])[0]
        trigger = trigger if trigger in VALID_TRIGGERS else "manual"
        threading.Thread(target=_run_worker_sync, args=(force, days, trigger), daemon=True).start()
        self._send_json(202, {"status": "accepted", "message": "Sync started in the background.", "force": force})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path in ("/", "/health", "/api/health"):
            self._send_json(200, {
                "status": "healthy",
                "service": "internpulse-worker",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "last_sync": _last_sync_time,
                "sync_state": _last_sync_status,
                "stats": _last_sync_stats,
                "quota": get_quota(),
                "configured": _configured(),
            })
        elif path == "/api/quota":
            self._send_json(200, get_quota())
        elif path == "/api/sync":
            self._start_sync(parsed)
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        if (parsed.path.rstrip("/") or "/") == "/api/sync":
            self._start_sync(parsed)
        else:
            self._send_json(404, {"error": "Not Found"})

    def log_message(self, format, *args):
        logger.debug("%s - %s", self.address_string(), format % args)


def run_server():
    try:
        port = int(os.environ.get("PORT", "10000"))
    except ValueError:
        port = 10000
    httpd = ThreadingHTTPServer(("0.0.0.0", port), HealthAndSyncHandler)
    logger.info("InternPulse worker listening on 0.0.0.0:%d", port)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server shutting down...")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    run_server()
