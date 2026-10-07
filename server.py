"""
server.py — Lightweight HTTP health-check server and background worker runner.

Binds to 0.0.0.0:$PORT (default 10000) to satisfy Render Web Service port requirements,
while executing quota-managed background syncs.

Endpoints:
  GET  /            -> Status & quota overview (JSON)
  GET  /health      -> 200 OK (Render health-check)
  GET  /api/health  -> 200 OK
  GET  /api/quota   -> Current daily sync quota usage
  POST /api/sync    -> Trigger pipeline sync (asynchronous)
  GET  /api/sync    -> Trigger pipeline sync
"""
import os
import sys
import json
import time
import logging
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone

import config
from config import setup_logging
from sync_quota import can_sync, get_quota, record_sync

logger = setup_logging("server")

_sync_lock = threading.Lock()
_last_sync_time = None
_last_sync_status = "idle"


def _run_worker_sync(force: bool = False) -> dict:
    """Execute pipeline sync inside a thread."""
    global _last_sync_time, _last_sync_status
    if not _sync_lock.acquire(blocking=False):
        return {"status": "already_running", "message": "A sync is already in progress."}

    try:
        allowed, quota = can_sync()
        if not allowed and not force:
            _last_sync_status = "quota_exceeded"
            logger.warning(
                "Sync skipped: daily limit reached (%d/%d used today).",
                quota["syncs_today"], quota["daily_limit"]
            )
            return {
                "status": "quota_exceeded",
                "message": f"Daily sync limit reached ({quota['syncs_today']}/{quota['daily_limit']}).",
                "quota": quota
            }

        _last_sync_status = "running"
        logger.info("Starting background sync run...")
        
        try:
            from main import run_once
            run_once()
            record_sync()
            _last_sync_time = datetime.now(timezone.utc).isoformat()
            _last_sync_status = "success"
            logger.info("Background sync completed successfully.")
            return {"status": "success", "completed_at": _last_sync_time}
        except Exception as exc:
            _last_sync_status = f"failed: {exc}"
            logger.error("Background sync failed: %s", exc, exc_info=True)
            return {"status": "error", "error": str(exc)}
    finally:
        _sync_lock.release()


def _periodic_worker_loop():
    """Background loop that runs periodic syncs when quota allows."""
    logger.info("Background worker loop initialized.")
    # Allow 10 seconds for initial Render port scan and deployment verification to succeed
    time.sleep(10)
    
    while True:
        try:
            allowed, quota = can_sync()
            if allowed:
                logger.info("Quota available (%d/%d used). Triggering scheduled sync...", quota["syncs_today"], quota["daily_limit"])
                _run_worker_sync(force=False)
            else:
                logger.debug("Quota exhausted (%d/%d used). Sleeping until next window.", quota["syncs_today"], quota["daily_limit"])
        except Exception as exc:
            logger.warning("Error in periodic worker loop: %s", exc)

        # Sleep for 1 hour between checks
        time.sleep(3600)


class HealthAndSyncHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, data: dict):
        payload = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path in ("/", "/health", "/api/health"):
            quota = get_quota()
            self._send_json(200, {
                "status": "healthy",
                "service": "ai-job-tracker-worker",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "last_sync": _last_sync_time,
                "sync_state": _last_sync_status,
                "quota": quota
            })
        elif path == "/api/quota":
            self._send_json(200, get_quota())
        elif path == "/api/sync":
            params = parse_qs(parsed.query)
            force = params.get("force", ["false"])[0].lower() in ("true", "1", "yes")
            # Run sync in thread so HTTP request returns quickly
            thread = threading.Thread(target=_run_worker_sync, args=(force,), daemon=True)
            thread.start()
            self._send_json(202, {
                "status": "accepted",
                "message": "Sync job initiated in background.",
                "force": force
            })
        else:
            self._send_json(404, {"error": "Not Found", "path": self.path})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/api/sync":
            thread = threading.Thread(target=_run_worker_sync, args=(False,), daemon=True)
            thread.start()
            self._send_json(202, {
                "status": "accepted",
                "message": "Sync job initiated in background."
            })
        else:
            self._send_json(404, {"error": "Not Found", "path": self.path})

    def log_message(self, format, *args):
        # Route HTTP access logs to standard logger
        logger.debug("%s - %s", self.address_string(), format % args)


def run_server():
    port_str = os.environ.get("PORT", "10000")
    try:
        port = int(port_str)
    except ValueError:
        port = 10000

    host = "0.0.0.0"
    server_address = (host, port)
    
    httpd = ThreadingHTTPServer(server_address, HealthAndSyncHandler)
    logger.info("Starting HTTP worker server on %s:%d (satisfying Render Web Service port check)...", host, port)

    # Start the background periodic sync loop thread
    worker_thread = threading.Thread(target=_periodic_worker_loop, daemon=True)
    worker_thread.start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server shutting down...")
    finally:
        httpd.server_close()
        logger.info("Server closed.")


if __name__ == "__main__":
    run_server()
