"""
config.py — Centralised configuration and environment validation.
All modules import settings from here; never read os.environ directly elsewhere.
"""
import os
import sys
import logging
from pathlib import Path
from dotenv import load_dotenv

# ── Resolve project root & load .env ────────────────────────────────────────
ROOT_DIR = Path(__file__).parent.resolve()
load_dotenv(ROOT_DIR / ".env", override=True)

# ── Logging ──────────────────────────────────────────────────────────────────
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()

def setup_logging(name: str = "ai-job-tracker") -> logging.Logger:
    """Create a logger that writes to stdout and to logs/tracker.log."""
    log_dir = ROOT_DIR / "logs"
    log_dir.mkdir(exist_ok=True)

    fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    # Avoid adding duplicate handlers when re-imported
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=getattr(logging, LOG_LEVEL, logging.INFO),
            format=fmt,
            datefmt=datefmt,
            handlers=[
                logging.StreamHandler(sys.stdout),
                logging.FileHandler(log_dir / "tracker.log", encoding="utf-8"),
            ],
        )
    return logging.getLogger(name)


# ── Supabase ─────────────────────────────────────────────────────────────────
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    or os.getenv("SUPABASE_KEY", "")
    or os.getenv("SUPABASE_ANON_KEY", "")
)

# ── Notion (Legacy / Optional) ───────────────────────────────────────────────
NOTION_API_KEY: str = os.getenv("NOTION_API_KEY", "")
NOTION_DATABASE_ID: str = os.getenv("NOTION_DATABASE_ID", "")

# ── OpenAI ───────────────────────────────────────────────────────────────────
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

# ── Gemini (free alternative to OpenAI) ──────────────────────────────────────
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

# ── Telegram ─────────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")

# ── Gmail ────────────────────────────────────────────────────────────────────
GMAIL_CREDENTIALS_FILE: Path = ROOT_DIR / os.getenv("GMAIL_CREDENTIALS_FILE", "credentials.json")
GMAIL_TOKEN_FILE: Path = ROOT_DIR / os.getenv("GMAIL_TOKEN_FILE", "token.json")
GMAIL_MAX_RESULTS: int = int(os.getenv("GMAIL_MAX_RESULTS", "50"))

DEFAULT_GMAIL_QUERY: str = (
    "-in:trash -in:spam ("
    "subject:(applied OR application OR interview OR assessment OR \"offer letter\" OR shortlisted OR "
    "\"coding test\" OR \"hiring\" OR \"status of your application\" OR \"thank you for your interest\" OR "
    "\"next steps\" OR \"screening\" OR \"recruitment\" OR \"job opportunity\") "
    "OR from:(greenhouse.io OR lever.co OR myworkday.com OR smartrecruiters.com OR ashbyhq.com OR "
    "internshala.com OR unstop.com OR linkedin.com OR jobvite.com OR taleo.net OR icims.com OR workable.com)"
    ")"
)
GMAIL_DAYS: str = os.getenv("GMAIL_DAYS", "").strip()
_base_query: str = os.getenv("GMAIL_QUERY", DEFAULT_GMAIL_QUERY)
if GMAIL_DAYS and GMAIL_DAYS.lower() != "all":
    GMAIL_QUERY: str = f"{_base_query} newer_than:{GMAIL_DAYS}d"
else:
    GMAIL_QUERY: str = _base_query

# Cloud Deployment: If the raw JSON is provided via ENV, write it to the file so the app can use it
_creds_json = os.getenv("GMAIL_CREDENTIALS_JSON")
if _creds_json and not GMAIL_CREDENTIALS_FILE.exists():
    try:
        GMAIL_CREDENTIALS_FILE.write_text(_creds_json, encoding="utf-8")
    except Exception as e:
        logging.error("Failed to write GMAIL_CREDENTIALS_JSON from env: %s", e)

_token_json = os.getenv("GMAIL_TOKEN_JSON")
if _token_json and not GMAIL_TOKEN_FILE.exists():
    try:
        GMAIL_TOKEN_FILE.write_text(_token_json, encoding="utf-8")
    except Exception as e:
        logging.error("Failed to write GMAIL_TOKEN_JSON from env: %s", e)

# ── Daily Sync Limit & Quota ────────────────────────────────────────────────
DAILY_SYNC_LIMIT: int = int(os.getenv("DAILY_SYNC_LIMIT", "5"))

# ── Data dir ─────────────────────────────────────────────────────────────────
DATA_DIR: Path = ROOT_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# ── Gmail OAuth scopes ───────────────────────────────────────────────────────
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

# ── Application status labels (canonical) ───────────────────────────────────
STATUS_LABELS = [
    "Applied",
    "Under Review",
    "OA Sent",
    "Interview Scheduled",
    "Rejected",
    "Offer",
    "Ghosted",
    "Unknown",
]

# ── Statuses that should trigger Telegram alerts ─────────────────────────────
NOTIFY_STATUSES = {"Applied", "OA Sent", "Interview Scheduled", "Rejected", "Offer", "Job Opportunity", "Needs Review"}


def validate_env(required: list[str]) -> None:
    """Raise EnvironmentError if any required env var is missing or still a placeholder."""
    missing = []
    for key in required:
        val = os.getenv(key, "")
        if not val or val.startswith("your_"):
            missing.append(key)
    if missing:
        raise EnvironmentError(
            f"Missing or unset environment variable(s): {', '.join(missing)}\n"
            f"Please fill in your .env file at: {ROOT_DIR / '.env'}"
        )


def _key_status(val: str, prefix: str = "your_") -> str:
    """Return a short status string for a config key value."""
    if not val or val.startswith(prefix):
        return "NOT SET"
    return f"{val[:8]}..."


def print_startup_diagnostics() -> None:
    """Print a clean startup banner showing all service statuses."""
    gemini_status   = _key_status(GEMINI_API_KEY)
    supabase_status = _key_status(SUPABASE_URL)
    telegram_status = _key_status(TELEGRAM_BOT_TOKEN)

    logger = logging.getLogger("config")
    logger.info("=" * 60)
    logger.info("INTERN PULSE — STARTUP DIAGNOSTICS")
    logger.info("=" * 60)
    if supabase_status == "NOT SET":
        logger.info("  Database   : Local SQLite Engine (data/jobs.db)")
    else:
        logger.info("  Database   : Supabase Cloud (%s)", supabase_status)
    logger.info("  Gemini     : %s", gemini_status)
    logger.info("  Telegram   : %s", telegram_status)
    logger.info("  Gmail creds: %s", "FOUND" if GMAIL_CREDENTIALS_FILE.exists() else "MISSING")
    logger.info("  Gmail token: %s", "FOUND" if GMAIL_TOKEN_FILE.exists() else "MISSING (will OAuth)")
    logger.info("=" * 60)
