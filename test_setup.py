"""
test_setup.py — Quick smoke-test to verify the environment is wired up correctly.

Run:  .venv\\Scripts\\python.exe test_setup.py

Checks:
  1. Python version >= 3.11
  2. All required packages importable
  3. .env loaded with expected keys present
  4. credentials.json exists
  5. Keyword classifier works offline
  6. (Optional) Notion connectivity
  7. (Optional) Telegram connectivity
"""
import sys
import importlib

# Fix Windows console encoding so Unicode check-marks print correctly
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

print(f"Python {sys.version}")
major, minor = sys.version_info[:2]
if (major, minor) < (3, 11):
    print(f"  ⚠  WARNING: Python 3.11+ recommended (found {major}.{minor})")
else:
    print(f"  ✓  Python version OK ({major}.{minor})")

# ── 2. Required packages ──────────────────────────────────────────────────────
required = [
    "google.auth", "googleapiclient", "google_auth_oauthlib",
    "notion_client", "dotenv", "pandas", "requests",
    "openai", "schedule", "bs4",
]

print("\nChecking imports…")
all_ok = True
for mod in required:
    try:
        importlib.import_module(mod)
        print(f"  ✓  {mod}")
    except ImportError as e:
        print(f"  ✗  {mod}  — {e}")
        all_ok = False

if not all_ok:
    print("\n  Run:  .venv\\Scripts\\pip install -r requirements.txt")

# ── 3. .env and config ────────────────────────────────────────────────────────
print("\nLoading config…")
try:
    import config
    print(f"  ✓  config loaded from {config.ROOT_DIR}")

    checks = {
        "NOTION_API_KEY":    config.NOTION_API_KEY,
        "NOTION_DATABASE_ID": config.NOTION_DATABASE_ID,
        "OPENAI_API_KEY":    config.OPENAI_API_KEY,
        "TELEGRAM_BOT_TOKEN": config.TELEGRAM_BOT_TOKEN,
        "TELEGRAM_CHAT_ID":  config.TELEGRAM_CHAT_ID,
    }
    for key, val in checks.items():
        if not val or val.startswith("your_"):
            print(f"  ⚠  {key} is NOT set")
        else:
            print(f"  ✓  {key} = {val[:8]}…")
except Exception as e:
    print(f"  ✗  config error: {e}")

# ── 4. credentials.json ───────────────────────────────────────────────────────
print("\nChecking credentials.json…")
import config as _cfg
if _cfg.GMAIL_CREDENTIALS_FILE.exists():
    print(f"  ✓  Found: {_cfg.GMAIL_CREDENTIALS_FILE}")
else:
    print(f"  ✗  NOT FOUND: {_cfg.GMAIL_CREDENTIALS_FILE}")
    print("     Download from Google Cloud Console → APIs & Services → Credentials")

# ── 5. Keyword classifier (offline) ──────────────────────────────────────────
print("\nTesting keyword classifier (offline)…")
try:
    from status_classifier import classify_email_ai
    dummy = {
        "subject":  "Congratulations! You have received an offer from Acme Corp",
        "body":     "We are pleased to offer you the position of Software Engineer Intern.",
        "sender":   "hr@acme.com",
        "email_id": "test123",
        "date_iso": "2024-01-01T00:00:00.000Z",
    }
    result = classify_email_ai(dummy)
    print(f"  ✓  Classifier result: {result}")
except Exception as e:
    print(f"  ✗  Classifier error: {e}")

# ── 6. Notion connectivity (optional) ─────────────────────────────────────────
print("\nTesting Notion connectivity…")
try:
    import config as _cfg2
    if _cfg2.NOTION_API_KEY and not _cfg2.NOTION_API_KEY.startswith("your_"):
        from notion_client import Client
        client = Client(auth=_cfg2.NOTION_API_KEY)
        me = client.users.me()
        print(f"  ✓  Notion connected as: {me.get('name', me.get('id', '?'))}")
    else:
        print("  ⚠  Skipped (NOTION_API_KEY not set)")
except Exception as e:
    print(f"  ✗  Notion error: {e}")

# ── 7. Telegram connectivity (optional) ──────────────────────────────────────
print("\nTesting Telegram connectivity…")
try:
    import config as _cfg3
    if (_cfg3.TELEGRAM_BOT_TOKEN and not _cfg3.TELEGRAM_BOT_TOKEN.startswith("your_")):
        import requests as _req
        url = f"https://api.telegram.org/bot{_cfg3.TELEGRAM_BOT_TOKEN}/getMe"
        r = _req.get(url, timeout=8)
        data = r.json()
        if data.get("ok"):
            print(f"  ✓  Telegram bot: @{data['result']['username']}")
        else:
            print(f"  ✗  Telegram error: {data}")
    else:
        print("  ⚠  Skipped (TELEGRAM_BOT_TOKEN not set)")
except Exception as e:
    print(f"  ✗  Telegram error: {e}")

print("\n" + "=" * 50)
print("Setup test complete. Fix any ✗ / ⚠ items above.")
print("Then run:  .venv\\Scripts\\python.exe main.py")
