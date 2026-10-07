<div align="center">

# ⚡ InternPulse

### An autonomous AI-powered internship tracking system

*Reads your Gmail → Classifies with Gemini AI → Detects scam companies → Updates Notion → Alerts you on Telegram — all automatically, with smart daily quota management.*

<br/>

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Notion](https://img.shields.io/badge/Notion-Database-000000?style=for-the-badge&logo=notion&logoColor=white)](https://notion.so)
[![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots)
[![Next.js](https://img.shields.io/badge/Dashboard-Next.js_15-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![GitHub Actions](https://img.shields.io/badge/CI/CD-GitHub_Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/features/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

</div>

---

## 📖 What is InternPulse?

Applying to internships means drowning in emails — confirmations, rejections, OAs, interview invites — across 10 different portals. **InternPulse automates all of that.**

It silently monitors your Gmail inbox, uses Google Gemini AI to understand each email, and:
- Logs the application to your **Notion database**
- Sends you a **Telegram alert** with company scam analysis and interview prep tips
- Picks out the best **job opportunities** from digest emails (Internshala, LinkedIn, Unstop)
- Runs **daily or on-demand** via GitHub Actions, Web Dashboard, and Telegram — respecting configurable daily sync quotas

---

## ✨ Features

| Feature | Details |
|:---|:---|
| 🧠 **Gemini AI Classification** | Understands the intent of every email — Applied, Rejected, OA, Interview, Offer |
| 🔡 **Keyword Fallback** | Zero downtime if Gemini is rate-limited — a robust keyword classifier takes over |
| 🕵️ **Scam Company Detection** | Web-searches every new company and uses AI to flag High/Medium/Low scam risk |
| 🎯 **Interview Prep Sheets** | Auto-generates tech stack, recent news & likely interview questions the moment you get an interview |
| 💼 **Job Opportunity Digests** | Extracts the best AI/ML/Data roles from digest emails and sends instant Telegram alerts |
| 📊 **Notion Dashboard** | Auto-creates rows, avoids duplicates, updates status as your application progresses |
| 🔔 **Rich Telegram Alerts** | Beautifully formatted messages with emoji, company name, role, risk score, and prep tips |
| 🌐 **Next.js Web Dashboard** | A cinematic dark-mode UI with Kanban board, funnel chart, activity timeline, and safety scanner |
| ⏱️ **Daily Quota & On-Demand** | Daily sync schedule with calendar rollover, quota protection, and instant web/Telegram triggers |

---

## 🏗️ How It Works

```
Your Gmail Inbox
       │
       ▼
  gmail_reader.py        ← OAuth2 fetch of latest emails
       │
       ▼
  utils.py               ← Pre-filters non-job emails (saves AI quota)
       │
       ▼
  status_classifier.py   ← Gemini 2.5 Flash → Keyword fallback
       │
       ├──→ company_researcher.py  ← DuckDuckGo + Gemini scam analysis
       │
       ▼
  db_manager.py          ← Universal DB manager (Supabase PostgREST + SQLite)
       │
       ▼
  telegram_notifier.py   ← Rich HTML alert to your Telegram
       │
       ▼
  email_history.py       ← Mark email as processed (prevents re-processing)
```

---

## 🚀 Setup Guide

> Follow these steps carefully. The whole setup takes about 10 minutes.

### Step 1 — Prerequisites

Make sure you have:
- **Python 3.12+** → [Download](https://python.org/downloads)
- **Git** → [Download](https://git-scm.com)
- A **Google Account** (the Gmail you want to monitor)
- A **Supabase account** (free) → [supabase.com](https://supabase.com)
- A **Telegram account**

---

### Step 2 — Clone & Install

```bash
git clone https://github.com/chaitanyakumarAI/AI-Internship-Tracker.git
cd AI-Internship-Tracker

# Create virtual environment
python -m venv .venv

# Activate it:
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

---

### Step 3 — Get Your API Keys

#### 🔵 Google Gemini (Free)
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API Key** → **Create API Key**
3. Copy the key — it looks like `AIzaSy...`

#### 🟢 Supabase Database
1. Go to [supabase.com](https://supabase.com) and create a free project (e.g., `InternPulse`)
2. In your Supabase Dashboard, open **SQL Editor** → **New Query**
3. Paste the contents of `supabase_schema.sql` and click **Run**
4. Go to **Project Settings** → **API**:
   - Copy **Project URL** (`https://xyz.supabase.co`)
   - Copy **service_role secret** (or `anon public` key)

#### 🔵 Telegram Bot
1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts to create a bot
3. Copy the **Bot Token** (looks like `123456789:AAxxxxxx`)
4. To get your **Chat ID**: search for **@userinfobot** on Telegram and send it `/start`. It will reply with your Chat ID.

#### 🟠 Gmail OAuth
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g., `InternPulse`)
3. Go to **APIs & Services** → **Enable APIs** → search and enable **Gmail API**
4. Go to **APIs & Services** → **OAuth consent screen**:
   - User type: **External** → Fill in app name → Save
   - Go to **Audience** → click **Publish App** *(prevents 7-day token expiry)*
5. Go to **APIs & Services** → **Clients** → **Create OAuth Client ID**:
   - Application type: **Desktop App** → Create
   - Click **Download JSON** → rename it to `credentials.json` → place it in the project root

---

### Step 4 — Configure Environment

Copy the example file and fill in your keys:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_or_anon_key

# Google Gemini
GEMINI_API_KEY=AIzaSy...

# Telegram
TELEGRAM_BOT_TOKEN=123456789:AAxxxxxx
TELEGRAM_CHAT_ID=123456789
```

---

### Step 5 — Seed / Migrate Database

Run the migration script to seed your database with existing tracked applications:

```bash
python migrate_notion_to_supabase.py
```

> **Zero-Config Fallback:** If `SUPABASE_URL` is not yet configured, the system automatically uses a high-performance local SQLite database (`data/jobs.db`).

---

### Step 6 — First Run (Gmail Auth)

```bash
python main.py
```

On the **first run only**, a browser window will open asking you to sign in to Google and grant Gmail read access. After you approve, a `token.json` file is saved automatically — you won't be asked again.

---

### Step 7 — Verify Everything Works

```bash
python test_setup.py
```

You should see all tests passing. If any fail, the error message will tell you exactly what's wrong.

---

### Step 8 — On-Demand Sync & Daily Limit

InternPulse uses an enforced daily sync quota (default 5 syncs/day, configurable via `DAILY_SYNC_LIMIT`) with automatic rollover at 00:00 UTC, removing the need for CPU-intensive background poll loops.

```bash
# Run a quota-checked sync
python main.py

# Or run via scheduler script
python scheduler.py

# Force sync (bypasses daily quota for testing)
python main.py --force
```

---

### Step 9 — 2-Way Interactive Telegram Bot

You can control your application pipeline, check stats, and trigger Gmail scans directly from Telegram via `@InternSlaveBot`:

| Command | Action | Example |
|---|---|---|
| `/status <Company> <Status>` | Update job stage in Notion | `/status Google Offer` |
| `/list [limit]` | View latest applications and status badges | `/list 8` |
| `/scan [days]` | Trigger an on-demand Gmail sync cycle | `/scan 7` |
| `/quota` | Check remaining daily sync quota | `/quota` |
| `/stats` | View active pipeline conversion & velocity | `/stats` |
| `/help` | View interactive command guide | `/help` |

**To run the interactive Telegram Bot listener locally:**
```bash
python telegram_bot.py
```
*(When deployed to Vercel, the Next.js API webhook at `/api/telegram/webhook` handles commands 24/7 automatically).*

---

## ⚙️ GitHub Actions (Fully Cloud Automated — Recommended)

This is the best way to run InternPulse — it runs automatically in the cloud every 3 hours for free.

### Setup

1. Fork or push this repo to your GitHub account
2. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add each of these:

| Secret Name | Where to get it |
|---|---|
| `NOTION_API_KEY` | Your Notion integration token |
| `NOTION_DATABASE_ID` | The ID from your Notion database URL |
| `GEMINI_API_KEY` | From Google AI Studio |
| `TELEGRAM_BOT_TOKEN` | From @BotFather on Telegram |
| `TELEGRAM_CHAT_ID` | From @userinfobot on Telegram |
| `GMAIL_CREDENTIALS_JSON` | Paste the **entire contents** of `credentials.json` |
| `GMAIL_TOKEN_JSON` | Paste the **entire contents** of `token.json` (generated in Step 6) |

4. Done! The workflow in `.github/workflows/tracker.yml` runs automatically every 3 hours.

> **To trigger it manually:** Go to your repo → **Actions** tab → **AI Internship Tracker** → **Run workflow**

---

## 🌐 Web Dashboard

A cinematic dark-mode dashboard is included in the `/web` folder.

```bash
cd web
npm install
npm run dev
# Open http://localhost:3000
```

**Set the Supabase credentials for the dashboard:**

Create `web/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_public_key
```

### Dashboard Pages

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` | Application list, stats, safety scanner, activity chart |
| Job Board | `/pipeline` | Kanban board by status |
| AI Insights | `/hub` | Job opportunity alerts & tips |

---

## 📁 Project Structure

```
AI-Internship-Tracker/
│
├── 🐍 Python Backend
│   ├── main.py                 # Pipeline orchestrator (quota-enforced entry point)
│   ├── db_manager.py           # Universal Supabase & SQLite database manager
│   ├── sync_quota.py           # Daily sync quota manager & calendar rollover
│   ├── scheduler.py            # On-demand quota-checked sync runner
│   ├── server.py               # Render web worker with health check server
│   ├── gmail_reader.py         # Gmail OAuth2 + email fetching & parsing
│   ├── status_classifier.py    # Gemini AI + keyword fallback classifier
│   ├── company_researcher.py   # AI scam detection & interview prep generator
│   ├── threat_detector.py      # Multi-layer scam & certificate mill threat engine
│   ├── telegram_notifier.py    # Rich HTML Telegram message builder & sender
│   ├── telegram_bot.py         # 2-way interactive Telegram bot command runner
│   ├── email_history.py        # Processed email cache (prevents duplicates)
│   ├── dashboard.py            # CLI pipeline dashboard & stats
│   ├── config.py               # All env vars, logging setup, constants
│   └── utils.py                # Shared helpers: retry, HTML parser, hashing
│
├── 🛠️ Utilities & Database
│   ├── supabase_schema.sql     # PostgreSQL schema, triggers & RLS policies
│   ├── migrate_notion_to_supabase.py # One-time migration & seed utility
│   ├── reprocess.py            # Wipes cache & reprocesses last 100 emails
│   ├── test_setup.py           # Smoke test for your environment setup
│   └── test_integration.py     # Full integration test suite (31 tests)
│
├── 🌐 Web Dashboard (Next.js 15)
│   └── web/
│       ├── src/app/            # Pages: Dashboard, Pipeline (Kanban), Hub
│       ├── src/components/     # Sidebar, Charts, ParticleSphere, JobCard
│       └── package.json
│
├── ⚙️ Automation
│   └── .github/workflows/tracker.yml   # GitHub Actions (runs daily at 08:00 UTC or manual dispatch)
│
├── .env.example                # Template — copy to .env and fill in keys
├── credentials.json            # Gmail OAuth client (never commit!)
├── token.json                  # Gmail token cache (never commit!)
├── requirements.txt
└── LICENSE
```

---

## 📬 Telegram Notification Examples

**New Application Tracked:**
```
🆕 New application tracked

📝 Status: Applied
🏢 Company: Google
💼 Role: STEP Intern (Software)
📧 Subject: Thank you for applying — Google Internship
📅 Time: 2026-05-23 06:00 UTC

✅ Risk Assessment: Low
Google is a globally recognized company with verified presence.
```

**Interview Scheduled + Prep Sheet:**
```
🆕 New application tracked

🎯 Status: Interview Scheduled
🏢 Company: Bluestock Fintech
💼 Role: Data Analyst Intern
📅 Time: 2026-05-21 17:35 UTC

✅ Risk Assessment: Low
Established fintech firm with active LinkedIn and Glassdoor reviews.

🧠 Interview Prep Sheet:
• Tech Stack: Python, SQL, Power BI, Excel
• Likely Questions: SQL aggregation, data cleaning, case studies
• Recent News: Expanding analytics team in 2026
```

**Hot Job Opportunity:**
```
🔥 Hot Job Recommendation Found!

💼 Status: Job Opportunity
🏢 Company: Amazon
💼 Role: ML Engineer Intern
🔗 Job Link: https://amazon.jobs/...
```

---

## 🔧 Troubleshooting

| Problem | Solution |
|---|---|
| **Browser doesn't open on first run** | Run `python main.py` from a terminal that can open a browser window (not SSH) |
| **`invalid_grant` Gmail error** | Your token expired — run `python main.py` again to re-authenticate, then update `GMAIL_TOKEN_JSON` in GitHub secrets |
| **Notion 404 / unauthorized** | Check `NOTION_DATABASE_ID` and make sure you clicked **Connect to → your integration** inside Notion |
| **No Telegram messages** | Run `python -c "import telegram_notifier; telegram_notifier.send_message('test')"` to verify connectivity |
| **Gemini 429 rate limit** | Normal — the keyword fallback activates automatically, no action needed |
| **All emails show `Unknown`** | Gemini may be down — wait an hour or check [status.cloud.google.com](https://status.cloud.google.com) |
| **GitHub Action fails** | Check that all 7 secrets are added correctly. Go to **Actions → failed run → logs** to see the exact error |

---

## 🤝 Contributing

Pull requests are welcome!

1. Fork the repo
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ to automate the most tedious part of job hunting.**

If InternPulse helped you, please ⭐ **star the repo** — it helps others find it!

[⭐ Star on GitHub](https://github.com/chaitanyakumarAI/AI-Internship-Tracker) &nbsp;·&nbsp; [🐛 Report a Bug](https://github.com/chaitanyakumarAI/AI-Internship-Tracker/issues) &nbsp;·&nbsp; [💡 Request a Feature](https://github.com/chaitanyakumarAI/AI-Internship-Tracker/issues)

</div>