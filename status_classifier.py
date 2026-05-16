"""
status_classifier.py — AI-powered structured email classification.

Classification priority chain:
  1. OpenAI GPT-4o-mini     (best accuracy, requires paid credits)
  2. Google Gemini Flash     (FREE tier — 15 req/min, 1M tokens/day)
  3. Keyword-based fallback  (offline, always works)
"""
import re
import json
import logging
from typing import Optional
from pathlib import Path
from datetime import datetime, timezone

import config
from utils import clean_text, is_job_related

logger = logging.getLogger(__name__)

# ── Status labels (canonical set) ─────────────────────────────────────────────
VALID_STATUSES = set(config.STATUS_LABELS) | {"Needs Review"}
VALID_PLATFORMS = {"LinkedIn", "Internshala", "Unstop", "Wellfound", "Naukri", "Company Portal", "Direct Email", "Unknown"}

# ── Session-level flags ───────────────────────────────────────────────────────
_openai_quota_exceeded = False
_gemini_failed         = False

# ── Lazy clients ─────────────────────────────────────────────────────────────
_openai_client = None
_gemini_model  = None

# ── Debugging ────────────────────────────────────────────────────────────────
DEBUG_LOG_FILE = config.ROOT_DIR / "logs" / "extraction_debug.json"
DEBUG_LOG_FILE.parent.mkdir(exist_ok=True)

def _log_debug(email: dict, raw_response: str, parsed: dict, method: str):
    try:
        data = []
        if DEBUG_LOG_FILE.exists():
            with open(DEBUG_LOG_FILE, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                except:
                    pass
        
        data.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "method": method,
            "subject": email.get("subject"),
            "sender": email.get("sender"),
            "raw_response": raw_response,
            "parsed": parsed
        })
        
        with open(DEBUG_LOG_FILE, "w", encoding="utf-8") as f:
            json.dump(data[-100:], f, indent=2) # Keep last 100
    except Exception as e:
        logger.warning(f"Failed to write debug log: {e}")

def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        try:
            from openai import OpenAI
            _openai_client = OpenAI(api_key=config.OPENAI_API_KEY)
        except Exception as exc:
            logger.warning("OpenAI client init failed: %s", exc)
            _openai_client = None
    return _openai_client


def _get_gemini_client():
    global _gemini_model
    if _gemini_model is None:
        try:
            from google import genai
            _gemini_model = genai.Client(api_key=config.GEMINI_API_KEY)
            logger.info("Gemini client initialised.")
        except Exception as exc:
            logger.warning("Gemini client init failed: %s", exc)
            _gemini_model = None
    return _gemini_model


# ── Shared prompt ────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are an expert at analyzing job/internship application emails.
Your goal is to extract structured information from the email.

CRITICAL FILTERS - Ignore the following completely (mark is_job_application=false):
- Course advertisements, masterclasses, or webinar promotions.

If the email is a Job Recommendation, Digest, or "Hiring Now" alert (e.g. from Internshala, LinkedIn, Unstop):
- Set is_job_application = true.
- Look for the BEST role matching AI, Machine Learning, Data Science, Data Analyst, or Software Engineering.
- Set company_name to the company hiring for that role (not the platform name).
- Set role to that specific role.
- Set status = "Job Opportunity".

If the email is an application confirmation (e.g., "Thank you for applying", "Your application has been received" from Workday or others):
- Set status = "Applied".

Return ONLY valid JSON matching this schema:
{
  "is_job_application": boolean,
  "reasoning": "Brief explanation of your classification and confidence",
  "confidence_score": integer (0 to 100),
  "company_name": "Name of the company hiring (or null if unknown)",
  "role": "Job/internship title (or null)",
  "status": "One of: Applied | Under Review | OA Sent | Interview Scheduled | Rejected | Offer | Ghosted | Needs Review | Job Opportunity | Unknown",
  "platform": "One of: LinkedIn | Internshala | Unstop | Wellfound | Naukri | Company Portal | Direct Email | Unknown",
  "interview_date": "ISO string or null",
  "oa_link": "URL or null",
  "recruiter_name": "Name of recruiter or null"
}

STATUS RULES:
- If confidence_score < 70, status MUST be "Needs Review" (unless it's a "Job Opportunity").
- "Offer" means a concrete offer was extended. Do not hallucinate this.
- "Rejected" means explicitly rejected.
- "Interview Scheduled" means an interview is confirmed.
- "OA Sent" means an online assessment/test link was sent.
- "Applied" means confirmation of application.
- "Under Review" means moving to the next stage but no interview yet.
- "Job Opportunity" means it's a digest/alert about a company hiring, NOT an application you submitted.
""".strip()


# ── Main classifier entry point ───────────────────────────────────────────────

def classify_email_ai(email: dict) -> dict:
    """
    Classify an email using the best available AI model.
    Falls back through: OpenAI -> Gemini -> Keyword classifier.
    """
    global _openai_quota_exceeded, _gemini_failed

    subject = email.get("subject", "")
    body    = email.get("body", "")
    sender  = email.get("sender", "")

    # Fast pre-filter
    if not is_job_related(subject, body, sender):
        logger.debug("Skipping non-job email: %s", subject[:60])
        return _fallback_result(email, reason="not job-related")

    user_content = (
        f"Subject: {subject}\n\n"
        f"From: {sender}\n\n"
        f"Body:\n{clean_text(body, max_chars=3000)}"
    )

    # ── Try OpenAI ────────────────────────────────────────────────────────────
    if not _openai_quota_exceeded:
        client = _get_openai_client()
        if client and config.OPENAI_API_KEY and not config.OPENAI_API_KEY.startswith("your_"):
            try:
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user",   "content": user_content},
                    ],
                    temperature=0.1,
                    max_tokens=500,
                    response_format={ "type": "json_object" }
                )
                raw = response.choices[0].message.content.strip()
                result = _parse_llm_response(raw)
                _log_debug(email, raw, result, "OpenAI")
                
                if not result.get("is_job_application", True):
                    return _fallback_result(email, reason="Filtered by AI: " + result.get("reasoning", ""))
                    
                logger.info(
                    "OpenAI classified [%s] -> status=%s company=%s conf=%s",
                    subject[:50], result.get("status"), result.get("company"), result.get("confidence_score")
                )
                return result
            except Exception as exc:
                exc_str = str(exc)
                if "insufficient_quota" in exc_str or "quota" in exc_str.lower() or "429" in exc_str:
                    _openai_quota_exceeded = True
                    logger.warning(
                        "OpenAI quota exceeded — switching to Gemini (free) for this session."
                    )
                else:
                    logger.warning("OpenAI classification failed (%s); trying Gemini.", exc)
        else:
            if not _openai_quota_exceeded:
                logger.info("OpenAI not configured — trying Gemini.")
            _openai_quota_exceeded = True  # skip on future calls

    # ── Try Gemini (free) ─────────────────────────────────────────────────────
    if not _gemini_failed:
        if config.GEMINI_API_KEY and not config.GEMINI_API_KEY.startswith("your_"):
            client = _get_gemini_client()
            if client:
                try:
                    full_prompt = f"{_SYSTEM_PROMPT}\n\n---\n\n{user_content}"
                    # Use standard generate_content, instruct to return JSON
                    response = client.models.generate_content(
                        model='gemini-2.5-flash',
                        contents=full_prompt,
                        config={"temperature": 0.1, "response_mime_type": "application/json"}
                    )
                    raw = response.text.strip()
                    result = _parse_llm_response(raw)
                    _log_debug(email, raw, result, "Gemini")
                    
                    if not result.get("is_job_application", True):
                        return _fallback_result(email, reason="Filtered by AI: " + result.get("reasoning", ""))

                    logger.info(
                        "Gemini classified [%s] -> status=%s company=%s conf=%s",
                        subject[:50], result.get("status"), result.get("company"), result.get("confidence_score")
                    )
                    return result
                except Exception as exc:
                    exc_str = str(exc)
                    if "quota" in exc_str.lower() or "429" in exc_str or "rate" in exc_str.lower():
                        logger.warning("Gemini rate limit hit; falling back to keyword classifier.")
                    else:
                        _gemini_failed = True
                        logger.warning("Gemini failed (%s); using keyword fallback.", exc)
        else:
            if not _gemini_failed:
                logger.info("Gemini not configured (GEMINI_API_KEY not set) — using keyword fallback.")
            _gemini_failed = True

    # ── Keyword fallback ──────────────────────────────────────────────────────
    result = _keyword_classify(email)
    _log_debug(email, "Keyword fallback", result, "Keyword")
    return result


# ── JSON parsing helper ────────────────────────────────────────────────────────

def _parse_llm_response(raw: str) -> dict:
    """Parse the LLM JSON output, fixing common issues."""
    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?", "", raw.strip(), flags=re.IGNORECASE)
    raw = re.sub(r"```$", "", raw.strip()).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("LLM returned invalid JSON; using defaults. Raw: %s", raw[:200])
        data = {}

    status = data.get("status", "Unknown")
    if status not in VALID_STATUSES:
        status = "Unknown"
        
    confidence = data.get("confidence_score", 0)
    try:
        confidence = int(confidence)
    except:
        confidence = 0
        
    if confidence < 70 and status not in ("Unknown", "Needs Review"):
        status = "Needs Review"
        
    platform = data.get("platform", "Unknown")
    if platform not in VALID_PLATFORMS:
        platform = "Unknown"

    return {
        "is_job_application": data.get("is_job_application", True),
        "reasoning":      data.get("reasoning", ""),
        "company":        data.get("company_name") or data.get("company") or "Unknown",
        "role":           data.get("role") or "Unknown",
        "status":         status,
        "platform":       platform,
        "oa_link":        data.get("oa_link") or None,
        "interview_date": data.get("interview_date") or None,
        "recruiter_name": data.get("recruiter_name") or None,
        "confidence_score": confidence,
        "notes":          f"Conf: {confidence}. {data.get('reasoning', '')}"[:2000],
    }


# ── Keyword-based fallback classifier ─────────────────────────────────────────

_REJECTION_KW = [
    "unfortunately", "not move forward", "not selected", "not been selected",
    "regret to inform", "other candidates", "pursue other", "we won't be",
    "not progressing", "application unsuccessful", "unable to move",
    "will not be moving", "we have decided", "not shortlisted",
]
_OFFER_KW = [
    "offer letter", "pleased to offer", "are delighted to offer",
    "we are offering", "extend an offer", "congratulations.*offer",
    "selected for the role", "welcome to the team", "you have been selected",
]
_INTERVIEW_KW = [
    "interview scheduled", "invite you for an interview", "interview on",
    "interview at", "technical interview", "hr interview", "schedule a call",
    "zoom link", "google meet", "teams link", "interview invite",
    "round of interview", "next round", "interview invite from",
    "shortlisted for interview",
]
_OA_KW = [
    "online assessment", "coding challenge", "coding test", "hackerrank",
    "hackerearth", "mettl", "codility", "take-home", "assessment link",
    "complete the test", "attempt the assessment", "amcat", "shl.com",
    "unstop.com/challenges",
]
_UNDER_REVIEW_KW = [
    "under review", "being reviewed", "shortlisted", "in review",
    "reviewing your", "screening", "keep your application",
    "your application has been received", "application is being processed",
]
_APPLIED_KW = [
    "application received", "thank you for applying", "we have received your",
    "successfully applied", "application submitted", "applied for",
]

# ── Role extraction — improved patterns ───────────────────────────────────────

_ROLE_PATTERNS = [
    r"(data\s+science\s+intern(?:ship)?)",
    r"(machine\s+learning\s+intern(?:ship)?)",
    r"(artificial\s+intelligence\s+intern(?:ship)?)",
    r"(ai\s+(?:engineer|research|ml)\s+intern(?:ship)?)",
    r"(software\s+(?:engineer|engineering|development)\s+intern(?:ship)?)",
    r"(swe\s+intern(?:ship)?)",
    r"(sde\s+intern(?:ship)?)",
    r"(backend\s+(?:developer|engineer)\s+intern(?:ship)?)",
    r"(frontend\s+(?:developer|engineer)\s+intern(?:ship)?)",
    r"(full\s*stack\s+(?:developer|engineer)\s+intern(?:ship)?)",
    r"(web\s+(?:developer|development)\s+intern(?:ship)?)",
    r"(android\s+(?:developer|development)\s+intern(?:ship)?)",
    r"(ios\s+(?:developer|development)\s+intern(?:ship)?)",
    r"(flutter\s+(?:developer|development)\s+intern(?:ship)?)",
    r"(react\s+(?:developer|development|native)\s+intern(?:ship)?)",
    r"(python\s+(?:developer|development)\s+intern(?:ship)?)",
    r"(java\s+(?:developer|development)\s+intern(?:ship)?)",
    r"(cloud\s+(?:computing|engineer)\s+intern(?:ship)?)",
    r"(devops\s+intern(?:ship)?)",
    r"(data\s+(?:analyst|analytics|engineering|engineer)\s+intern(?:ship)?)",
    r"(product\s+(?:management|manager)\s+intern(?:ship)?)",
    r"(business\s+(?:development|analyst)\s+intern(?:ship)?)",
    r"(marketing\s+intern(?:ship)?)",
    r"(content\s+(?:writing|writer|marketing)\s+intern(?:ship)?)",
    r"(ui\s*/?\s*ux\s+(?:design|designer)?\s+intern(?:ship)?)",
    r"(graphic\s+design\s+intern(?:ship)?)",
    r"(research\s+intern(?:ship)?)",
    r"(hr\s+intern(?:ship)?)",
    r"(finance\s+intern(?:ship)?)",
    r"(cybersecurity\s+intern(?:ship)?)",
    r"(nlp\s+(?:engineer|research)?\s+intern(?:ship)?)",
    r"(computer\s+vision\s+intern(?:ship)?)",
    r"for\s+([\w\s]+(?:intern(?:ship)?|engineer|analyst|developer|designer|manager))",
    r"(?:position|role|internship|job)[:\s]+([A-Za-z\s]+?)(?:\s*[-|@(]|$)",
    r"(?:application|applied)[:\s]+([A-Za-z\s]+?)(?:\s*[-|@(]|$)",
]

_INTERNSHALA_RE = re.compile(
    r"(?:Interview\s+Invite|Update)\s+.*?\s+for\s+(.+?)(?:\s+at\s+|\s+from\s+|\s*$)",
    re.IGNORECASE,
)


def _extract_role(subject: str, body: str = "") -> str:
    subj_lower = subject.lower().strip()
    
    m = _INTERNSHALA_RE.search(subject)
    if m:
        role = m.group(1).strip()
        if len(role) >= 4:
            return role[:100]

    for pattern in _ROLE_PATTERNS[:32]:
        m = re.search(pattern, subj_lower)
        if m:
            return m.group(1).strip().title()[:100]
            
    body_lower = body[:1000].lower()
    for pattern in _ROLE_PATTERNS[:32]:
        m = re.search(pattern, body_lower)
        if m:
            return m.group(1).strip().title()[:100]

    for pattern in _ROLE_PATTERNS[32:]:
        m = re.search(pattern, subj_lower, re.IGNORECASE)
        if m:
            role = m.group(1).strip()
            if 3 <= len(role) <= 80:
                return role.strip()[:100]

    return "Unknown"


def _extract_company(sender: str, subject: str = "") -> str:
    name_match = re.match(r'^"?([^"<]+)"?\s*<', sender)
    if name_match:
        name = name_match.group(1).strip()
        if name.lower() not in ("noreply", "no-reply", "donotreply", "team", "support", "careers", "recruitment", "talent acquisition"):
            name = re.sub(r"\s+(?:Team|Recruiting|Talent|Careers|HR)$", "", name, flags=re.IGNORECASE).strip()
            if len(name) >= 2 and "internshala" not in name.lower() and "linkedin" not in name.lower():
                return name[:80]
                
    m = re.search(r"at\s+([A-Z][a-zA-Z0-9\s]+?)(?:\s+for\s+|\s*$|\s+[-|@])", subject)
    if m:
        comp = m.group(1).strip()
        if len(comp) > 2 and comp.lower() not in ("internshala", "linkedin"):
            return comp[:80]

    match = re.search(r"@([\w.-]+)\.", sender)
    if match:
        domain = match.group(1)
        for prefix in ("mail", "email", "noreply", "no-reply", "careers", "jobs", "hr", "info", "donotreply", "talent"):
            domain = re.sub(rf"^{prefix}\.", "", domain)
        return domain.title()

    return "Unknown"


def _extract_link(text: str) -> Optional[str]:
    urls = re.findall(r"https?://[^\s\"'<>]+", text)
    oa_domains = ("hackerrank", "hackerearth", "mettl", "codility", "amcat", "shl", "unstop",
                  "testgorilla", "interviewbit", "codesignal", "coderpad")
    for url in urls:
        if any(d in url for d in oa_domains):
            return url
    return None
    
def _determine_platform(sender: str, body: str) -> str:
    sender_lower = sender.lower()
    body_lower = body.lower()
    
    if "linkedin.com" in sender_lower or "linkedin" in sender_lower:
        return "LinkedIn"
    if "internshala.com" in sender_lower or "internshala" in sender_lower:
        return "Internshala"
    if "unstop.com" in sender_lower or "unstop" in sender_lower:
        return "Unstop"
    if "wellfound.com" in sender_lower or "angel.co" in sender_lower:
        return "Wellfound"
    if "naukri.com" in sender_lower:
        return "Naukri"
        
    if "myworkdayjobs.com" in body_lower or "greenhouse.io" in body_lower or "lever.co" in body_lower or "smartrecruiters.com" in body_lower:
        return "Company Portal"
        
    return "Direct Email"

def _keyword_classify(email: dict) -> dict:
    subject = email.get("subject", "")
    body    = email.get("body", "")
    sender  = email.get("sender", "")
    text    = (subject + " " + body).lower()

    # Check if it's a digest/newsletter before standard keyword checking
    rejections = [
        "newsletter", "digest", "recommended jobs", "jobs for you", 
        "internships you might like", "jobs you might like",
        "new jobs matching your profile", "weekly updates",
        "internships posted", "hackathons", "@unstop.news"
    ]
    subj_sender = f"{subject} {sender}".lower()
    
    if any(rej in subj_sender for rej in rejections):
        status = "Job Opportunity"
    elif any(kw in text for kw in _OFFER_KW) or re.search(r"congratulations.*(?:selected|offer|join)", text):
        status = "Offer"
    elif any(kw in text for kw in _INTERVIEW_KW):
        status = "Interview Scheduled"
    elif any(kw in text for kw in _OA_KW):
        status = "OA Sent"
    elif any(kw in text for kw in _REJECTION_KW):
        status = "Rejected"
    elif any(kw in text for kw in _UNDER_REVIEW_KW):
        status = "Under Review"
    elif any(kw in text for kw in _APPLIED_KW):
        status = "Applied"
    else:
        status = "Unknown"

    company = _extract_company(sender, subject)
    role    = _extract_role(subject, body)
    platform = _determine_platform(sender, body)

    return {
        "is_job_application": True,
        "company":        company,
        "role":           role,
        "status":         status,
        "platform":       platform,
        "oa_link":        _extract_link(text),
        "interview_date": None,
        "recruiter_name": None,
        "confidence_score": 40, # Keyword is low confidence
        "notes":          "(keyword fallback)",
    }


def _fallback_result(email: dict, reason: str = "") -> dict:
    return {
        "is_job_application": False,
        "company":        "Unknown",
        "role":           "Unknown",
        "status":         "Unknown",
        "platform":       "Unknown",
        "oa_link":        None,
        "interview_date": None,
        "recruiter_name": None,
        "confidence_score": 0,
        "notes":          f"Skipped: {reason}",
    }
