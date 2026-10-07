"""
threat_detector.py — Multi-Layer Threat, Scam & Fake Email Detection Engine.

Analyzes emails and companies across 5 threat layers:
  1. Free public email domain spoofing (claiming to be MNC from @gmail.com)
  2. Advance fee / payment demands (registration fee, security deposit, training fee)
  3. Telegram / task scams (rating videos, crypto, daily task commissions)
  4. Predatory mass-internship certificate mills blocklist
  5. Phishing / suspicious form / shortened URL detection
"""
import re
import logging
from typing import Dict, Tuple, Optional

logger = logging.getLogger(__name__)

# ── 1. Known Predatory Platforms Blocklist ─────────────────────────────────────
# Platforms repeatedly documented for deceptive offers, fake certificates, or fee extortion.
PREDATORY_BLOCKLIST: Dict[str, str] = {
    "labmentix": "Known predatory platform offering fake or paid internship certification schemes with zero industry value.",
    "bluestock": "Frequently reported for deceptive offer letters, charging training/verification fees, and aggressive marketing.",
    "codsoft": "Known mass-automated unpaid certificate loops without genuine mentorship or real production code.",
    "octanet": "Flagged for sending generic automated unpaid internship certificates with high spam volume.",
    "oasis infobyte": "Mass automated certificate loop with low educational credibility.",
    "letsgrowmore": "Mass-generated certificate loop involving copy-paste beginner tasks.",
    "lgm": "Associated with LetsGrowMore automated certificate loops.",
    "bharat intern": "Unpaid automated task loop offering certificates without verified corporate standing.",
    "motioncut": "Unpaid automated task loop with generic certificates.",
    "technohacks": "Reported for certificate-selling schemes and unpaid repetitive tasks.",
    "internpe": "Known generic task-loop portal offering automated certificates.",
    "vaultofcodes": "Automated unpaid task loops with minimal verification.",
    "zenotalent": "Reported on community forums for soliciting training fees after initial selection.",
}

# ── 2. Well-Known Enterprise Companies (Must use corporate domain) ────────────
ENTERPRISE_COMPANIES = {
    "google", "microsoft", "amazon", "apple", "meta", "netflix", "l'oréal", "loreal",
    "accenture", "barclays", "jpmorgan", "jpmorganchase", "goldman sachs", "morgan stanley",
    "target", "walmart", "electronic arts", "ea", "ge aerospace", "general electric",
    "applied materials", "deloitte", "pwc", "ey", "ernst & young", "kpmg", "mckinsey",
    "tcs", "tata consultancy", "infosys", "wipro", "hcl", "cognizant", "capgemini",
    "uber", "airbnb", "adobe", "salesforce", "intel", "nvidia", "cisco", "ibm", "oracle"
}

# ── 3. Free Public Email Providers ────────────────────────────────────────────
FREE_PUBLIC_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com",
    "hotmail.com", "live.com", "msn.com", "proton.me", "protonmail.com",
    "rediffmail.com", "zoho.com", "mail.com", "gmx.com", "yandex.com",
    "yopmail.com", "tempmail.com", "guerrillamail.com"
}

# ── 4. Advance Fee & Payment Regex Patterns ───────────────────────────────────
ADVANCE_FEE_PATTERNS = [
    r"\b(?:registration|enrollment|training|caution|security|verification|document|exam|laptop|equipment|id\s*card)\s+(?:fee|fees|charge|charges|deposit|cost|amount|payment)\b",
    r"\b(?:pay|deposit|transfer|send)\s+(?:rs\.?|inr|usd|\$|€|£)\s*\d+",
    r"\b\d+\s*(?:rs\.?|inr|usd|\$)\s+(?:fee|deposit|refundable|charge)\b",
    r"\brefundable\s+(?:security\s+)?deposit\b",
    r"\bpay\s+(?:before|prior\s+to|for)\s+(?:joining|onboarding|offer|certificate)\b",
    r"\bfee\s+is\s+mandatory\b",
]

# ── 5. Telegram & Task Scam Patterns ─────────────────────────────────────────
TASK_SCAM_PATTERNS = [
    r"\bjoin\s+(?:our\s+)?telegram\s+(?:channel|group|chat)\b",
    r"\bt\.me/[a-zA-Z0-9_+]+",
    r"\btelegram\s*:\s*@",
    r"\b(?:youtube|video)\s+(?:like|subscribe|rating)\s+task\b",
    r"\b(?:daily|part-time)\s+(?:income|earnings|commission|tasks)\s+(?:of\s+)?(?:rs|inr|\$)\b",
    r"\bearn\s+\d+\s*(?:to|-)\s*\d+\s*(?:per\s+day|daily)\b",
    r"\b(?:crypto|usdt|bitcoin)\s+(?:payout|wallet|deposit)\b",
]

# ── 6. Suspicious Link Patterns ───────────────────────────────────────────────
LINK_SHORTENER_DOMAINS = {
    "bit.ly", "tinyurl.com", "is.gd", "cutt.ly", "rb.gy", "t.co", "shorturl.at", "ow.ly"
}


def extract_domain(email_str: str) -> str:
    """Extract domain from an email address string like 'Recruiter <hr@company.com>'."""
    if not email_str:
        return ""
    m = re.search(r"@([\w.-]+)", email_str)
    if m:
        return m.group(1).lower().strip()
    return ""


def evaluate_threat(
    company_name: str,
    subject: str = "",
    body: str = "",
    sender: str = "",
) -> Dict[str, str]:
    """
    Comprehensive rule-based threat evaluation.
    Returns:
      {
        "scam_risk": "High" | "Medium" | "Low" | "Unknown",
        "risk_notes": "Detailed explanation of risk indicators",
        "threat_category": "predatory_platform" | "domain_spoof" | "advance_fee" | "task_scam" | "verified" | "none"
      }
    """
    comp_clean = company_name.lower().strip()
    sender_lower = sender.lower().strip()
    subject_lower = subject.lower().strip()
    body_lower = (body[:4000] if body else "").lower()
    full_text = f"{subject_lower} {body_lower}"
    sender_domain = extract_domain(sender)

    # ─────────────────────────────────────────────────────────────────────────
    # RULE 1: Known Predatory Platform Blocklist (HIGH RISK)
    # ─────────────────────────────────────────────────────────────────────────
    for blocked_key, note in PREDATORY_BLOCKLIST.items():
        # Match as whole word or direct inclusion in company name
        pattern = rf"(^|[\s._,-]){re.escape(blocked_key)}([\s._,-]|$)"
        if re.search(pattern, comp_clean) or blocked_key in comp_clean.replace(" ", ""):
            return {
                "scam_risk": "High",
                "risk_notes": f"Predatory platform alert: {note}",
                "threat_category": "predatory_platform"
            }

    # ─────────────────────────────────────────────────────────────────────────
    # RULE 2: Advance Fee & Extortion Scam Patterns (HIGH RISK)
    # ─────────────────────────────────────────────────────────────────────────
    for pat in ADVANCE_FEE_PATTERNS:
        m = re.search(pat, full_text)
        if m:
            matched_phrase = m.group(0)
            return {
                "scam_risk": "High",
                "risk_notes": f"Advance Fee Warning: Email requests payment ('{matched_phrase}'). Legitimate employers NEVER charge fees for internships or jobs.",
                "threat_category": "advance_fee"
            }

    # ─────────────────────────────────────────────────────────────────────────
    # RULE 3: Telegram & Task Scams (HIGH RISK)
    # ─────────────────────────────────────────────────────────────────────────
    for pat in TASK_SCAM_PATTERNS:
        m = re.search(pat, full_text)
        if m:
            return {
                "scam_risk": "High",
                "risk_notes": "Task/Telegram Scam Warning: Email solicits joining Telegram or performing daily paid rating/like tasks.",
                "threat_category": "task_scam"
            }

    # ─────────────────────────────────────────────────────────────────────────
    # RULE 4: Domain Spoofing / Public Free Email Impersonation (HIGH RISK)
    # ─────────────────────────────────────────────────────────────────────────
    if sender_domain in FREE_PUBLIC_DOMAINS:
        # Check if the company claims to be a recognized enterprise
        for ent in ENTERPRISE_COMPANIES:
            if ent in comp_clean:
                return {
                    "scam_risk": "High",
                    "risk_notes": f"Domain Spoofing Alert: Recruiter claims to represent {company_name} but is sending from a public @{sender_domain} account instead of an official corporate domain.",
                    "threat_category": "domain_spoof"
                }

    # ─────────────────────────────────────────────────────────────────────────
    # RULE 5: Suspicious Link Shortener / Phishing Signals (MEDIUM RISK)
    # ─────────────────────────────────────────────────────────────────────────
    for shortener in LINK_SHORTENER_DOMAINS:
        if shortener in full_text:
            return {
                "scam_risk": "Medium",
                "risk_notes": f"Caution: Email uses masked shortened link ({shortener}). Verify destination URL before submitting personal details.",
                "threat_category": "suspicious_link"
            }

    # ─────────────────────────────────────────────────────────────────────────
    # RULE 6: Verified Legitimate Corporate Communications (LOW RISK)
    # ─────────────────────────────────────────────────────────────────────────
    # If from an official corporate domain or known reputable applicant tracking system
    VERIFIED_PORTAL_DOMAINS = {
        "internshala.com", "unstop.com", "linkedin.com", "myworkday.com",
        "workday.com", "greenhouse.io", "lever.co", "smartrecruiters.com",
        "ashbyhq.com", "target.com", "walmart.com", "accenture.com",
        "barclays.com", "jpmorganchase.com", "jpmorgan.com", "google.com",
        "microsoft.com", "amazon.com", "apple.com", "ea.com", "ge.com"
    }

    if any(sender_domain.endswith(vdom) for vdom in VERIFIED_PORTAL_DOMAINS):
        return {
            "scam_risk": "Low",
            "risk_notes": f"Verified recruitment communication via {sender_domain}.",
            "threat_category": "verified"
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Default: Low / Neutral (No red flags detected)
    # ─────────────────────────────────────────────────────────────────────────
    return {
        "scam_risk": "Low",
        "risk_notes": "No scam signals or fee requests detected in email headers and body.",
        "threat_category": "none"
    }
