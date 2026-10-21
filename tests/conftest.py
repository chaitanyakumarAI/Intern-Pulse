"""
Offline test harness.

The real config.py loads .env and may write Gmail credential files, so it is
replaced by a stub before any project module is imported. Every file the code
writes (SQLite DB, JSON state, logs) lives in a temporary directory, and no test
talks to Gmail, Gemini, Supabase, Telegram or DuckDuckGo.
"""
import ast
import logging
import os
import sys
import tempfile
import types
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
_SESSION_DIR = Path(tempfile.mkdtemp(prefix="internpulse-tests-"))

# Never let a real cloud database or API key leak into a test run.
for _var in ("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
             "SUPABASE_SECRET_KEY", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY",
             "NEXT_PUBLIC_SUPABASE_ANON_KEY", "GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"):
    os.environ.pop(_var, None)


def _build_config_stub() -> types.ModuleType:
    stub = types.ModuleType("config")
    stub.ROOT_DIR = _SESSION_DIR
    stub.DATA_DIR = _SESSION_DIR / "data"
    stub.DATA_DIR.mkdir(exist_ok=True)
    (_SESSION_DIR / "web" / "data").mkdir(parents=True, exist_ok=True)
    stub.GEMINI_API_KEY = ""
    stub.TELEGRAM_BOT_TOKEN = ""
    stub.TELEGRAM_CHAT_ID = ""
    stub.DAILY_SYNC_LIMIT = 5
    stub.GMAIL_MAX_RESULTS = 50
    stub.GMAIL_QUERY = ""
    stub._base_query = ""
    stub.setup_logging = lambda name="internpulse": logging.getLogger(name)
    stub.print_startup_diagnostics = lambda: None
    # Copy the real literals (parsed, never executed) so tests see the true contract.
    for node in ast.parse((REPO / "config.py").read_text(encoding="utf-8")).body:
        target = node.targets[0] if isinstance(node, ast.Assign) else getattr(node, "target", None)
        if getattr(target, "id", None) in ("STATUS_LABELS", "NOTIFY_STATUSES"):
            setattr(stub, target.id, ast.literal_eval(node.value))
    return stub


sys.modules["config"] = _build_config_stub()
sys.path.insert(0, str(REPO))

import config  # noqa: E402  (the stub)
import db_manager  # noqa: E402
import email_history  # noqa: E402
import status_classifier  # noqa: E402
import sync_quota  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_state(tmp_path, monkeypatch):
    """Fresh database, state files and Gemini session for every test."""
    monkeypatch.setattr(db_manager, "SQLITE_PATH", tmp_path / "jobs.db")
    monkeypatch.setattr(db_manager, "CANONICAL_JSON_PATH", tmp_path / "canonical_applications.json")
    db_manager._init_sqlite()
    monkeypatch.setattr(email_history, "_HISTORY_FILE", tmp_path / "processed_emails.json")
    monkeypatch.setattr(sync_quota, "QUOTA_FILE", tmp_path / "sync_quota.json")
    monkeypatch.setattr(status_classifier, "DEBUG_LOG_FILE", tmp_path / "extraction_debug.json")
    monkeypatch.setattr(status_classifier, "_sleep", lambda seconds: None, raising=False)
    monkeypatch.setattr(status_classifier.time, "sleep", lambda seconds: None)  # no real waiting in tests
    monkeypatch.setattr(status_classifier, "_gemini_clients", [])
    monkeypatch.setattr(status_classifier, "_current_client_idx", 0)
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    status_classifier.reset_gemini_session()
    yield tmp_path


@pytest.fixture
def job_email():
    """A synthetic interview email that passes the relevance gate."""
    return {
        "id": "msg-1",
        "email_id": "eid-1",
        "subject": "Interview Invitation – Data Science Intern",
        "sender": "Acme Careers <careers@acmeanalytics.example>",
        "body": "We'd like to invite you to a technical interview on 24 Oct at 3 PM IST. Join via Google Meet.",
        "date_iso": "2026-10-01T09:00:00.000Z",
    }
