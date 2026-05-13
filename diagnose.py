"""
diagnose.py — Deep diagnostic for the AI Job Tracker
Checks: Notion API methods, page creation, data_sources vs databases,
        OpenAI connectivity, Telegram, Gmail token validity.
"""
import sys, os, json
sys.stdout.reconfigure(encoding="utf-8")

import config
from notion_client import Client
from notion_client.errors import APIResponseError

client = Client(auth=config.NOTION_API_KEY)
db_id = config.NOTION_DATABASE_ID

# ── 1. DB Metadata ────────────────────────────────────────────────────────────
print("=" * 60)
print("1. NOTION DATABASE METADATA")
print("=" * 60)
try:
    db = client.databases.retrieve(database_id=db_id)
    obj_type = db.get("object", "N/A")
    print(f"   Object type : {obj_type}")
    props = db.get("properties", {})
    print(f"   Columns ({len(props)}): {sorted(props.keys())}")
    # Print each property type
    for name, prop in sorted(props.items()):
        print(f"     - {name}: {prop.get('type', '?')}")
except Exception as e:
    print(f"   ERROR: {e}")

# ── 2. databases.query ────────────────────────────────────────────────────────
print()
print("=" * 60)
print("2. TEST: client.databases.query()")
print("=" * 60)
try:
    resp = client.databases.query(database_id=db_id, page_size=2)
    results = resp.get("results", [])
    print(f"   OK. Returned {len(results)} row(s).")
    if results:
        r0 = results[0]
        print(f"   First row id: {r0.get('id', '?')}")
        props0 = r0.get("properties", {})
        status_val = props0.get("Status", {}).get("select")
        company_prop = props0.get("Company", {}).get("title", [{}])
        company_name = company_prop[0].get("text", {}).get("content", "?") if company_prop else "?"
        print(f"   First row Company: {company_name}, Status: {status_val}")
except Exception as e:
    print(f"   ERROR ({type(e).__name__}): {e}")

# ── 3. data_sources.query ─────────────────────────────────────────────────────
print()
print("=" * 60)
print("3. TEST: client.data_sources.query()")
print("=" * 60)
try:
    resp = client.data_sources.query(db_id, page_size=1)
    print(f"   OK. data_sources.query works! Results: {len(resp.get('results', []))}")
except AttributeError as e:
    print(f"   FAIL (AttributeError — data_sources does NOT exist): {e}")
except Exception as e:
    print(f"   ERROR ({type(e).__name__}): {e}")

# ── 4. Test pages.create with correct parent ──────────────────────────────────
print()
print("=" * 60)
print("4. TEST: pages.create with database_id parent")
print("=" * 60)
test_props = {
    "Company": {"title": [{"text": {"content": "DiagnosticTest"}}]},
    "Role": {"rich_text": [{"text": {"content": "Test Role"}}]},
    "Status": {"select": {"name": "Applied"}},
    "Platform": {"select": {"name": "Email"}},
    "Notes": {"rich_text": [{"text": {"content": "[eid:DIAG001] Diagnostic test row"}}]},
}
try:
    page = client.pages.create(
        parent={"type": "database_id", "database_id": db_id},
        properties=test_props,
    )
    print(f"   OK! Created page id: {page['id']}")
    # Clean it up
    client.pages.update(page_id=page["id"], archived=True)
    print(f"   Cleaned up (archived) test page.")
except Exception as e:
    print(f"   ERROR ({type(e).__name__}): {e}")

# ── 5. Test data_source_id parent (current broken code) ──────────────────────
print()
print("=" * 60)
print("5. TEST: pages.create with data_source_id parent (current code)")
print("=" * 60)
try:
    page = client.pages.create(
        parent={"type": "data_source_id", "data_source_id": db_id},
        properties=test_props,
    )
    print(f"   OK! data_source_id parent works. page id: {page['id']}")
    client.pages.update(page_id=page["id"], archived=True)
except Exception as e:
    print(f"   FAIL ({type(e).__name__}): {e}")

# ── 6. OpenAI test ────────────────────────────────────────────────────────────
print()
print("=" * 60)
print("6. OPENAI CONNECTIVITY")
print("=" * 60)
try:
    from openai import OpenAI
    oai = OpenAI(api_key=config.OPENAI_API_KEY)
    models = oai.models.list()
    print(f"   OK. OpenAI connected. Models available.")
except Exception as e:
    err = str(e)
    if "quota" in err.lower() or "insufficient" in err.lower():
        print(f"   QUOTA EXCEEDED: {err[:120]}")
    elif "auth" in err.lower() or "invalid" in err.lower():
        print(f"   AUTH ERROR: {err[:120]}")
    else:
        print(f"   ERROR ({type(e).__name__}): {err[:120]}")

# ── 7. Gmail token validity ───────────────────────────────────────────────────
print()
print("=" * 60)
print("7. GMAIL TOKEN STATUS")
print("=" * 60)
try:
    token_path = config.GMAIL_TOKEN_FILE
    if token_path.exists():
        with open(token_path) as f:
            tok = json.load(f)
        print(f"   token.json exists.")
        print(f"   scopes: {tok.get('scopes', 'N/A')}")
        print(f"   has refresh_token: {'refresh_token' in tok}")
        expiry = tok.get("expiry", "N/A")
        print(f"   expiry: {expiry}")
        from google.oauth2.credentials import Credentials
        creds = Credentials.from_authorized_user_file(str(token_path), config.GMAIL_SCOPES)
        print(f"   valid: {creds.valid}  expired: {creds.expired}")
    else:
        print("   token.json NOT FOUND — Gmail not yet authenticated")
except Exception as e:
    print(f"   ERROR: {e}")

# ── 8. Summary ────────────────────────────────────────────────────────────────
print()
print("=" * 60)
print("DIAGNOSIS COMPLETE")
print("=" * 60)
