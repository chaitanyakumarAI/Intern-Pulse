"""
company_researcher.py — Automated research for companies using DuckDuckGo & Gemini.
Provides Scam Risk Analysis and Interview Prep Cheat Sheets.
"""
import logging
import json
from typing import Dict, Optional
from duckduckgo_search import DDGS
import config

logger = logging.getLogger(__name__)

def _search_web(query: str, max_results: int = 3) -> str:
    """Perform a web search and return a concatenated string of results."""
    try:
        ddgs = DDGS()
        results = list(ddgs.text(query, max_results=max_results))
        if not results:
            return "No web results found."
        
        snippets = []
        for r in results:
            snippets.append(f"- {r.get('title')}: {r.get('body')} ({r.get('href')})")
        return "\n".join(snippets)
    except Exception as e:
        logger.warning("Web search failed for query '%s': %s", query, e)
        return "Web search unavailable."

def _heuristic_scam_check(company_name: str, scam_results: str) -> Dict[str, str]:
    """
    Fallback rule-based scam checker if Gemini is rate-limited or offline.
    Uses string matching against common red flags in search snippets and threat detector.
    """
    from threat_detector import evaluate_threat
    threat = evaluate_threat(company_name)
    if threat["scam_risk"] == "High":
        return {
            "scam_risk": "High",
            "risk_notes": f"[Threat Engine] {threat['risk_notes']}"
        }

    results_lower = scam_results.lower()

    # 2. Heuristic word matching
    high_risk_words = ["scam", "fake", "fraud", "scammer", "MLM", "pyramid scheme", "scammed", "predatory"]
    medium_risk_words = ["unpaid repetitive", "pay for certificate", "asking money", "deposit fee", "fees", "complaint", "not legit", "certificate scheme"]
    
    high_count = sum(1 for w in high_risk_words if w in results_lower)
    med_count = sum(1 for w in medium_risk_words if w in results_lower)
    
    if high_count >= 2:
        return {
            "scam_risk": "High",
            "risk_notes": "[Heuristic Fallback] Multiple online reviews flag this company as a potential scam or fake internship provider."
        }
    elif high_count >= 1 or med_count >= 2:
        return {
            "scam_risk": "Medium",
            "risk_notes": "[Heuristic Fallback] Several reviews suggest potential issues (unpaid mass certificates, fees, or mixed ratings)."
        }
        
    return {
        "scam_risk": "Low",
        "risk_notes": "[Heuristic Fallback] No significant scam reports or negative reviews found on Reddit or Google."
    }

COMPANY_CACHE_FILE = config.DATA_DIR / "company_cache.json"

def _load_cache() -> dict:
    if COMPANY_CACHE_FILE.exists():
        try:
            with open(COMPANY_CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_cache(cache: dict) -> None:
    try:
        COMPANY_CACHE_FILE.parent.mkdir(exist_ok=True)
        with open(COMPANY_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
    except Exception as e:
        logger.warning("Failed to save company cache: %s", e)

def analyze_company(company_name: str, role: str, status: str) -> Dict[str, str]:
    """
    Research a company.
    If it's any new application, check for scam/legitimacy risk.
    If it's an Interview, also generate an interview cheat sheet.
    Results are cached on disk in data/company_cache.json to save API quota.
    """
    if company_name == "Unknown" or company_name.lower() in ("linkedin", "internshala", "unstop"):
        return {"scam_risk": "Unknown", "risk_notes": "", "prep_sheet": ""}

    from threat_detector import evaluate_threat
    quick_threat = evaluate_threat(company_name)
    if quick_threat["scam_risk"] == "High":
        logger.info("Threat detector flagged %s as High risk: %s", company_name, quick_threat["risk_notes"])
        return {
            "scam_risk": "High",
            "risk_notes": quick_threat["risk_notes"],
            "prep_sheet": ""
        }
        
    comp_key = company_name.lower().strip()
    cache = _load_cache()
    cached_entry = cache.get(comp_key)
    
    # If already cached and we don't need a new interview prep sheet, reuse!
    if cached_entry:
        has_prep = bool(cached_entry.get("prep_sheet"))
        need_prep = (status == "Interview Scheduled")
        if not need_prep or has_prep:
            logger.info("Using cached company analysis for: %s (scam_risk=%s)", company_name, cached_entry.get("scam_risk"))
            return {
                "scam_risk": cached_entry.get("scam_risk", "Unknown"),
                "risk_notes": cached_entry.get("risk_notes", ""),
                "prep_sheet": cached_entry.get("prep_sheet", ""),
            }

    logger.info("Conducting AI web research on company: %s", company_name)
    
    # 1. Search for scam/legitimacy
    scam_query = f'"{company_name}" company (scam OR legit OR fake OR reviews) reddit'
    scam_results = _search_web(scam_query, max_results=4)
    
    # 2. If Interview, search for tech stack & interview questions
    prep_results = ""
    if status == "Interview Scheduled":
        prep_query = f'"{company_name}" "{role}" (tech stack OR interview questions OR glassdoor)'
        prep_results = _search_web(prep_query, max_results=5)

    # 3. Use Gemini to analyze the findings
    from status_classifier import _get_gemini_client
    from utils import retry
    import time
    
    prompt = f"""You are a cybersecurity expert and career advisor.
Analyze the following web search results for the company "{company_name}" (Role: {role}).

SCAM SEARCH RESULTS:
{scam_results}

INTERVIEW SEARCH RESULTS:
{prep_results}

Return ONLY valid JSON with this schema:
{{
  "scam_risk": "High | Medium | Low",
  "risk_notes": "1-2 short sentences explaining the scam risk (e.g., 'Reddit users report this is a known MLM scam' or 'Well known established company').",
  "prep_sheet": "If Interview Scheduled, provide a short bulleted list of 1. Likely Tech Stack, 2. Recent News, 3. Likely Interview Questions based on the role. Use formatting. If not an interview, leave empty string."
}}
"""
    # Fetch the rotating client manager
    from status_classifier import rotate_gemini_client, _get_gemini_client
    
    # Define retrying call helper
    @retry(max_attempts=3, delay=5.0, backoff=2.0, exceptions=(Exception,))
    def _call_gemini():
        active_client = _get_gemini_client()
        if not active_client:
            raise Exception("No active Gemini clients available.")
        try:
            response = active_client.models.generate_content(
                model='gemini-flash-latest',
                contents=prompt,
                config={"temperature": 0.2, "response_mime_type": "application/json"}
            )
            return response.text.strip()
        except Exception as exc:
            # Rotate immediately on error so the next retry attempt uses the next key!
            rotate_gemini_client()
            raise exc

    try:
        raw = _call_gemini()
        data = json.loads(raw)
        
        # Rate limit spacing: sleep 4.5s to respect the 15 requests per minute limit
        time.sleep(4.5)
        
        final_res = {
            "scam_risk": data.get("scam_risk", "Unknown"),
            "risk_notes": data.get("risk_notes", ""),
            "prep_sheet": data.get("prep_sheet", "")
        }
        cache[comp_key] = final_res
        _save_cache(cache)
        return final_res
    except Exception as e:
        logger.error("Failed to generate company analysis with Gemini: %s. Using heuristic fallback.", e)

            
    # Fallback to rules-based heuristic checker if AI is rate-limited or offline
    # Do not cache heuristic fallback permanently so future runs can retry full AI analysis
    fallback_res = _heuristic_scam_check(company_name, scam_results)
    return {
        "scam_risk": fallback_res["scam_risk"],
        "risk_notes": fallback_res["risk_notes"],
        "prep_sheet": ""
    }



