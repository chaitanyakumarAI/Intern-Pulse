"""
utils.py — Shared utility helpers used across all modules.
"""
import re
import hashlib
import logging
import time
import functools
from typing import Any, Callable
from datetime import datetime, timezone
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


# ── Text cleaning ─────────────────────────────────────────────────────────────

def html_to_text(html: str) -> str:
    """Convert HTML email body to plain text."""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["style", "script", "head"]):
        tag.decompose()
    return soup.get_text(separator=" ", strip=True)


def clean_text(text: str, max_chars: int = 4000) -> str:
    """Collapse whitespace and truncate for LLM prompts."""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


# ── Email fingerprinting ──────────────────────────────────────────────────────

def make_email_id(sender: str, subject: str, date: str) -> str:
    """
    Create a stable, short ID for an email so we can detect duplicates
    without storing the full message-id (which may be missing).
    """
    raw = f"{sender}|{subject}|{date}"
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


# ── Date helpers ──────────────────────────────────────────────────────────────

def now_iso() -> str:
    """Return current UTC time as ISO-8601 string (Notion-compatible)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def parse_email_date(date_str: str) -> str:
    """
    Try to parse the RFC-2822 email date header and return ISO-8601.
    Falls back to current UTC time on failure.
    """
    from email.utils import parsedate_to_datetime
    try:
        dt = parsedate_to_datetime(date_str)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    except Exception:
        return now_iso()


# ── Retry decorator ───────────────────────────────────────────────────────────

def retry(
    max_attempts: int = 3,
    delay: float = 2.0,
    backoff: float = 2.0,
    exceptions: tuple = (Exception,),
) -> Callable:
    """
    Decorator that retries a function call on specified exceptions.
    Uses exponential back-off.
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            attempt = 0
            wait = delay
            while attempt < max_attempts:
                try:
                    return func(*args, **kwargs)
                except exceptions as exc:
                    attempt += 1
                    if attempt >= max_attempts:
                        logger.error(
                            "Function %s failed after %d attempts: %s",
                            func.__name__, max_attempts, exc,
                        )
                        raise
                    logger.warning(
                        "Function %s failed (attempt %d/%d): %s — retrying in %.1fs",
                        func.__name__, attempt, max_attempts, exc, wait,
                    )
                    time.sleep(wait)
                    wait *= backoff
        return wrapper
    return decorator


# ── Keyword helpers ───────────────────────────────────────────────────────────

JOB_KEYWORDS = [
    # Application / offer flow
    "application", "applied", "applicant", "apply",
    "internship", "intern", "job", "position", "role", "opportunity",
    "offer", "offer letter", "placement",
    # Interview flow
    "interview", "shortlisted", "selected", "assessment",
    "online assessment", "oa ", "coding test", "technical round",
    "hr round", "hiring",
    # Rejection
    "unfortunately", "not move forward", "not selected", "not been selected",
    "regret", "other candidates", "pursue other",
    # Company-side phrases
    "talent acquisition", "recruiter", "recruiting", "careers@",
    "no-reply", "noreply", "hr@", "jobs@",
]

def is_job_related(subject: str, body: str, sender: str) -> bool:
    """
    Quick heuristic check before sending to the LLM.
    Returns True if the email looks job/internship-related.
    """
    haystack = " ".join([subject, body[:500], sender]).lower()
    
    # 1. Reject strict spam/newsletter keywords (Non-job related)
    rejections = [
        "promotional", "marketing", "advertisement",
        "courses", "masterclass", "webinar", "buy now", "buy course"
    ]
    
    # Check subject and sender first for strong rejection signals
    subj_sender = f"{subject} {sender}".lower()
    if any(rej in subj_sender for rej in rejections):
        return False
        
    # 2. Must contain job keywords
    return any(kw in haystack for kw in JOB_KEYWORDS)


def truncate(text: str, limit: int = 80) -> str:
    """Truncate for log lines."""
    return (text[:limit] + "…") if len(text) > limit else text
