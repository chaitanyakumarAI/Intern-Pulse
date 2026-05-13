"""
test_integration.py — Full integration test suite for the AI Internship Tracker.
Tests all modules, the complete pipeline, and verifies fixes from audit.

Run: .venv\\Scripts\\python.exe test_integration.py
"""
import sys, os, json, time
sys.stdout.reconfigure(encoding="utf-8")

PASS = "PASS"
FAIL = "FAIL"
SKIP = "SKIP"
results = []

def test(name: str, fn):
    try:
        outcome = fn()
        status = PASS if outcome is not False else FAIL
    except Exception as e:
        status = FAIL
        outcome = str(e)
    icon = "✅" if status == PASS else ("⏭️" if status == SKIP else "❌")
    print(f"  {icon}  {name}")
    if status == FAIL:
        print(f"       ERROR: {outcome}")
    results.append((name, status))
    return status == PASS

print()
print("=" * 65)
print("   AI INTERNSHIP TRACKER — INTEGRATION TEST SUITE")
print("=" * 65)

# ── 1. Python version ──────────────────────────────────────────────────────
print("\n[1] Python & Imports")
test("Python >= 3.11", lambda: sys.version_info >= (3, 11))

def _check_imports():
    import google.auth, googleapiclient, google_auth_oauthlib
    import notion_client, dotenv, pandas, requests, openai, schedule, bs4, lxml
    return True
test("All required packages importable", _check_imports)

def _check_gemini_import():
    import google.genai
    return True
test("google.genai importable", _check_gemini_import)

# ── 2. Config ─────────────────────────────────────────────────────────────
print("\n[2] Config & Environment")
import config

def _check_config():
    assert config.NOTION_API_KEY, "NOTION_API_KEY empty"
    assert config.NOTION_DATABASE_ID, "NOTION_DATABASE_ID empty"
    assert config.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN empty"
    return True
test("Config loads all required keys", _check_config)
test("credentials.json present", lambda: config.GMAIL_CREDENTIALS_FILE.exists())
test("token.json present", lambda: config.GMAIL_TOKEN_FILE.exists())
test("GEMINI_API_KEY slot exists in config", lambda: hasattr(config, "GEMINI_API_KEY"))
test("DATA_DIR created", lambda: config.DATA_DIR.exists())

# ── 3. Utils ──────────────────────────────────────────────────────────────
print("\n[3] Utils Module")
from utils import html_to_text, clean_text, make_email_id, parse_email_date, now_iso, is_job_related

test("html_to_text strips tags", lambda: "hello" in html_to_text("<p>hello</p>"))
test("clean_text collapses whitespace", lambda: clean_text("a  b   c") == "a b c")
test("make_email_id is stable + 16 chars",
     lambda: len(make_email_id("a@b.com", "test", "Mon")) == 16
     and make_email_id("a@b.com", "test", "Mon") == make_email_id("a@b.com", "test", "Mon"))
test("now_iso returns ISO string", lambda: now_iso().endswith("Z"))
test("is_job_related catches internship keyword",
     lambda: is_job_related("Internship opportunity", "", "") is True)
test("is_job_related rejects promo email",
     lambda: is_job_related("50% sale today", "Buy now", "promo@shop.com") is False)

# ── 4. Status Classifier ──────────────────────────────────────────────────
print("\n[4] Status Classifier")
from status_classifier import classify_email_ai, _keyword_classify, _extract_role, _extract_company

def _test_offer():
    result = _keyword_classify({
        "subject": "Congratulations! You have received an offer",
        "body": "We are pleased to offer you the position of Software Engineer.",
        "sender": "hr@acmecorp.com",
    })
    return result["status"] == "Offer"
test("Keyword: detects Offer", _test_offer)

def _test_interview():
    result = _keyword_classify({
        "subject": "Interview Invite from TSTEPS for Data Science Internship",
        "body": "You have been shortlisted for an interview.",
        "sender": "noreply@internshala.com",
    })
    return result["status"] == "Interview Scheduled"
test("Keyword: detects Interview Scheduled", _test_interview)

def _test_rejection():
    result = _keyword_classify({
        "subject": "Regarding your application",
        "body": "Unfortunately, we will not be moving forward with your application.",
        "sender": "hr@company.com",
    })
    return result["status"] == "Rejected"
test("Keyword: detects Rejected", _test_rejection)

def _test_role_internshala():
    role = _extract_role("Interview Invite from TSTEPS PRIVATE LIMITED for Data Science Internship")
    return "Data Science" in role or "data science" in role.lower()
test("Role extraction: Internshala format", _test_role_internshala)

def _test_role_swe():
    role = _extract_role("Your application for Software Engineer Internship at Google")
    return role.lower() != "unknown"
test("Role extraction: SWE Internship", _test_role_swe)

def _test_role_ml():
    role = _extract_role("Machine Learning Intern position — Next Steps")
    return role.lower() != "unknown"
test("Role extraction: ML Intern", _test_role_ml)

def _test_company_from_display():
    company = _extract_company("Acme Corp <hr@acme.com>")
    return "Acme" in company
test("Company extraction: from display name", _test_company_from_display)

def _test_company_from_domain():
    company = _extract_company("noreply@microsoft.com")
    return "Microsoft" in company
test("Company extraction: from domain", _test_company_from_domain)

# ── 5. Email History ──────────────────────────────────────────────────────
print("\n[5] Email History Tracking")
from email_history import get_processed_ids, mark_processed, is_processed, get_stats, clear_history

def _test_history_roundtrip():
    test_id = "test_gmail_id_integration_99999"
    # Clean up first
    ids_before = get_processed_ids()
    ids_before.discard(test_id)

    mark_processed([test_id])
    assert is_processed(test_id), "ID not found after mark_processed"

    stats = get_stats()
    assert stats["total_processed"] > 0
    return True
test("Email history: mark and retrieve ID", _test_history_roundtrip)

test("Email history: file exists after write",
     lambda: (config.DATA_DIR / "processed_emails.json").exists())

# ── 6. Notion Connectivity ─────────────────────────────────────────────────
print("\n[6] Notion Connectivity")
from notion_client import Client

def _test_notion_connect():
    client = Client(auth=config.NOTION_API_KEY)
    me = client.users.me()
    assert me.get("id"), "No user ID returned"
    return True
test("Notion API: authenticated", _test_notion_connect)

def _test_notion_query():
    client = Client(auth=config.NOTION_API_KEY)
    resp = client.data_sources.query(config.NOTION_DATABASE_ID, page_size=1)
    return isinstance(resp.get("results"), list)
test("Notion: data_sources.query works", _test_notion_query)

def _test_notion_page_create_and_delete():
    client = Client(auth=config.NOTION_API_KEY)
    props = {
        "Company": {"title": [{"text": {"content": "IntegrationTestCo"}}]},
        "Role": {"rich_text": [{"text": {"content": "Test Engineer"}}]},
        "Status": {"select": {"name": "Applied"}},
        "Platform": {"select": {"name": "Email"}},
        "Notes": {"rich_text": [{"text": {"content": "[eid:INTEGTEST001] auto-deleted"}}]},
    }
    page = client.pages.create(
        parent={"type": "data_source_id", "data_source_id": config.NOTION_DATABASE_ID},
        properties=props,
    )
    pid = page["id"]
    assert pid, "No page ID returned"
    # Clean up
    client.pages.update(page_id=pid, archived=True)
    return True
test("Notion: pages.create + archive works", _test_notion_page_create_and_delete)

# ── 7. Telegram ───────────────────────────────────────────────────────────
print("\n[7] Telegram")
import requests as _req

def _test_telegram_getme():
    url = f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/getMe"
    r = _req.get(url, timeout=15)
    data = r.json()
    assert data.get("ok"), f"Telegram error: {data}"
    return True
test("Telegram: bot reachable", _test_telegram_getme)

# ── 8. Dashboard module ───────────────────────────────────────────────────
print("\n[8] Dashboard Module")
def _test_dashboard_import():
    import dashboard
    assert hasattr(dashboard, "fetch_all_rows")
    assert hasattr(dashboard, "print_full_dashboard")
    return True
test("dashboard.py: importable + functions exist", _test_dashboard_import)

def _test_dashboard_parse():
    import dashboard
    rows = dashboard.fetch_all_rows()
    apps = dashboard.parse_rows(rows)
    assert isinstance(apps, list)
    return True
test("dashboard.py: fetch + parse Notion rows", _test_dashboard_parse)

# ── 9. Gmail token ────────────────────────────────────────────────────────
print("\n[9] Gmail Token")
def _test_gmail_token():
    import json
    from google.oauth2.credentials import Credentials
    if not config.GMAIL_TOKEN_FILE.exists():
        return False  # not an error, just needs OAuth
    creds = Credentials.from_authorized_user_file(
        str(config.GMAIL_TOKEN_FILE), config.GMAIL_SCOPES
    )
    assert creds.refresh_token, "No refresh_token — re-authenticate"
    return True
test("Gmail: token.json valid + has refresh_token", _test_gmail_token)

# ── Summary ────────────────────────────────────────────────────────────────
print()
print("=" * 65)
passed = sum(1 for _, s in results if s == PASS)
failed = sum(1 for _, s in results if s == FAIL)
skipped = sum(1 for _, s in results if s == SKIP)
print(f"  RESULTS: {passed} passed | {failed} failed | {skipped} skipped | {len(results)} total")
if failed == 0:
    print("  ALL TESTS PASSED — system is healthy!")
else:
    print(f"  {failed} test(s) failed — see errors above.")
print("=" * 65)
print()
sys.exit(0 if failed == 0 else 1)
