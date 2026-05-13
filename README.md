# AI Job Tracker

AI-powered internship/job application tracking system.  
Reads Gmail → classifies with OpenAI → updates Notion → alerts via Telegram.

---

## Quick Start

### 1. Fill in `.env`
Open `.env` and replace all `your_*` placeholders:

| Variable | Description |
|---|---|
| `NOTION_API_KEY` | Notion integration secret (starts with `secret_`) |
| `NOTION_DATABASE_ID` | ID from your Notion DB URL |
| `OPENAI_API_KEY` | OpenAI API key (optional — keyword fallback if absent) |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather (optional) |
| `TELEGRAM_CHAT_ID` | Your Telegram user/chat ID |

### 2. Verify setup
```powershell
.venv\Scripts\python.exe test_setup.py
```

### 3. Authenticate Gmail (first run)
```powershell
.venv\Scripts\python.exe main.py
```
A browser window will open for Google OAuth consent. After that, `token.json`
is cached — no further browser prompts needed.

### 4. Run on a schedule
```powershell
.venv\Scripts\python.exe scheduler.py        # runs every 3 hours (configurable)
.venv\Scripts\python.exe scheduler.py --once # single run
```

---

## Notion Database Setup

Create a Notion database with these **exact** property names and types:

| Property | Type |
|---|---|
| Company | Title |
| Role | Text |
| Status | Select |
| Email ID | Text |
| Sender | Text |
| Subject | Text |
| Date Received | Date |
| OA Link | URL |
| Notes | Text |
| Last Updated | Date |

**Status options to add in Notion:**
Applied, Under Review, OA Sent, Interview Scheduled, Rejected, Offer, Ghosted, Unknown

---

## Project Structure

```
ai-job-tracker/
├── main.py               # Pipeline orchestrator
├── gmail_reader.py       # Gmail OAuth + email fetching
├── status_classifier.py  # AI/keyword email classification
├── notion_updater.py     # Notion upsert with deduplication
├── telegram_notifier.py  # Telegram alerts
├── scheduler.py          # Recurring scheduler
├── config.py             # Env vars + logging setup
├── utils.py              # Shared helpers
├── test_setup.py         # Environment smoke test
├── .env                  # Your secrets (never commit!)
├── credentials.json      # Gmail OAuth client secret
├── token.json            # Gmail token cache (auto-generated)
├── requirements.txt
├── logs/                 # tracker.log written here
└── data/                 # Future: CSV exports, history
```

---

## Status Labels

| Status | Trigger |
|---|---|
| Applied | Application acknowledgement |
| Under Review | Shortlisted / screening |
| OA Sent | Coding challenge / assessment link |
| Interview Scheduled | Interview invite |
| Rejected | Rejection email |
| Offer | Offer letter |
| Ghosted | (manual / future: auto-detect silence) |

---

## Troubleshooting

**Gmail auth fails** — ensure `credentials.json` is the *OAuth 2.0 client* type (not a service account).  
**Notion 404** — double-check `NOTION_DATABASE_ID` and that the integration is shared with your DB.  
**OpenAI quota** — the keyword classifier kicks in automatically; no action needed.
