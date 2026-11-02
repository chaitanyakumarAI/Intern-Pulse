<div align="center">

# ⚡ InternPulse

### Your internship applications, tracked automatically from Gmail — on your phone

*Gmail → Gemini classification → scam check → Supabase → Telegram alerts → mobile app*

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Gemini](https://img.shields.io/badge/Gemini-Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Next.js](https://img.shields.io/badge/App-Next.js_16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![Android](https://img.shields.io/badge/Android-Capacitor-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://capacitorjs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

</div>

---

## 📖 What it does

Applying to internships means status updates scattered across company ATS emails (Workday, Greenhouse, Lever), Internshala, Unstop, LinkedIn and recruiters. InternPulse reads them for you:

- **Classifies every application email** — Applied, In review, Assessment, Interview, Offer, Rejected — and extracts company, role, links and interview dates.
- **Keeps one record per company** that only moves forward (a late "thanks for applying" can't undo an interview; a rejection or offer always lands).
- **Flags scams** — fee requests, big brands writing from Gmail, Telegram task scams, known fake-internship platforms.
- **Collects job leads** from LinkedIn/Internshala/Unstop alert emails.
- **Alerts you on Telegram** when something changes, and shows everything in a fast mobile app.

## 📱 The app

| Tab | What you see |
|---|---|
| **Today** | Interviews (with date and "add to calendar"), assessments with their links, applications that need a decision, scam warnings, new job leads |
| **Pipeline** | Every application, searchable and filterable by stage. Tap one to change its status, open the original email, read the AI prep sheet, keep notes or delete it |
| **Radar** | Job leads from alert emails (save / hide / open) and companies with scam warnings |
| **More** | Sync status and history, a "Deep scan" for the last 30 days, setup checks, sign-out |

It opens instantly from the last saved copy, works offline, supports pull-to-refresh, and the Android back button closes sheets and returns to *Today*.

## 🏗️ How it works

```
        every 3 h (GitHub Actions)              "Sync" in the app / Telegram /scan
                    │                                         │
                    ▼                                         ▼
     ┌───────────────────────── Render worker (server.py) ─────────────────────────┐
     │ main.run_once                                                                 │
     │  1. list Gmail message IDs → skip the ones already handled (Supabase)         │
     │  2. Tier 1: relevance filter (utils.is_job_related)                           │
     │  3. Tier 2: Gemini Flash, schema-enforced JSON, validated                     │
     │     ↳ overloaded → Gemini Flash Lite      ↳ unavailable → Tier 3 keywords     │
     │  4. scam rules → company research (web search + Gemini, cached)               │
     │  5. upsert one row per company · job digests → opportunities                  │
     │  6. Telegram alert on change · record the run in sync_runs                    │
     └───────────────────────────────────────┬───────────────────────────────────────┘
                                             ▼
                                  Supabase (PostgreSQL)
                                             ▲
           Next.js on Vercel (/api/*, password-protected)  ◄──  Android app (Capacitor shell)
```

| File | Role |
|---|---|
| `main.py` | Orchestrates one sync (`--dry-run`, `--limit`, `--days`, `--force`) |
| `gmail_reader.py` | OAuth (read-only scope), paginated listing, message parsing |
| `status_classifier.py` | Three-tier classifier: relevance gate → Gemini → keyword fallback |
| `threat_detector.py`, `company_researcher.py` | Scam rules, web research and interview prep sheets |
| `db_manager.py` | Applications: company-slug dedup and status rules (Supabase, SQLite fallback) |
| `cloud_state.py` | Durable state in Supabase: processed emails, research cache, sync runs, opportunities |
| `server.py` | The Render worker: `/health`, `/api/sync` |
| `web/` | Next.js mobile app, API routes and Telegram webhook; `web/android` is the Capacitor shell |
| `eval/` | Measures classification accuracy on emails you label |
| `tests/` | Offline pytest suite (no network) |

## 🚀 Setup

You need a Google account (Gmail + a Gemini API key), a Supabase project, free Render and Vercel accounts, and optionally a Telegram bot.

### 1. Local install and Gmail authorisation

```bash
git clone https://github.com/chaitanyakumarAI/Intern-Pulse.git
cd Intern-Pulse
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                  # fill in the keys below
python main.py --dry-run --limit 3                    # first run opens a browser to authorise Gmail
python doctor.py                                      # read-only setup check
```

Gmail: in Google Cloud Console enable the **Gmail API**, create an **OAuth client (Desktop app)**, save it as `credentials.json`, and **publish** the consent screen (otherwise the token expires every 7 days).

### 2. Database

Supabase → **SQL Editor** → paste [`supabase_schema.sql`](supabase_schema.sql) → **Run**. It is safe to run again after upgrades.

Moving to a new project (or the old one was paused and removed)? Your applications are backed up locally in `data/`: after running the schema in the new project and updating `.env`, run `python scripts/restore_backup.py --apply`.

### 3. Worker (Render)

Create a **Web Service** from this repo (start command `python server.py`) with:

| Variable | Value |
|---|---|
| `SUPABASE_URL`, `SUPABASE_KEY` | Project URL and the **secret** (`service_role`) key |
| `GEMINI_API_KEY` | One key, or several separated by commas (rotated on rate limits) |
| `GMAIL_CREDENTIALS_JSON`, `GMAIL_TOKEN_JSON` | Contents of `credentials.json` and `token.json` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Optional alerts |
| `SYNC_API_TOKEN` | A long random string (also set on Vercel and as a GitHub secret) |

### 4. App (Vercel)

Import the repo with **root directory `web`** and set:

| Variable | Value |
|---|---|
| `SUPABASE_URL`, `SUPABASE_KEY` | Same as Render (the secret key never reaches the browser) |
| `DASHBOARD_PASSWORD` | Your app password |
| `SYNC_API_TOKEN` | Same as Render |
| `RENDER_WORKER_URL` | Your worker URL (default `https://ai-job-tracker-worker.onrender.com`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` | Optional, for bot commands |

Register the bot: `python scripts/set_telegram_webhook.py https://<your-app>.vercel.app`.

Once **More → Setup** shows *Database access: Connected with the private server key*, run [`supabase_lockdown.sql`](supabase_lockdown.sql) to close the old public table policies.

### 5. Schedule (GitHub Actions)

Add the repository secret `SYNC_API_TOKEN` (and the variable `RENDER_WORKER_URL` if yours differs). **Scheduled Gmail Sync** wakes the worker every 3 hours; the pipeline's own secrets stay on Render.

### 6. Phone

Download **[InternPulse.apk](https://github.com/chaitanyakumarAI/Intern-Pulse/releases/download/android-latest/InternPulse.apk)** on the phone and open it (allow "Install unknown apps" when asked). Updates install over the previous version, and web changes reach the app as soon as Vercel deploys. Alternatively, open the Vercel URL in Chrome and choose **Add to Home screen**.

## 💬 Telegram commands

`/today` · `/list [n]` · `/stats` · `/status <company> <stage>` · `/scan` · `/quota` · `/web`

## 🧪 Tests and evaluation

```bash
pip install -r requirements-dev.txt
pytest                                                              # offline: stubbed config, temp SQLite, fake Gemini
python eval/evaluate_classifier.py export --count 100 --days 180    # then label eval/data/labels.csv
python eval/evaluate_classifier.py run --tier both                  # precision, recall, macro-F1, coverage
```

CI runs the Python tests and the web lint, type-check and build on every push.

## 🔧 Troubleshooting

| Problem | Fix |
|---|---|
| "Couldn't load your data: fetch failed" | The Supabase project is paused or gone (free projects pause when idle). Restore it from the Supabase dashboard, or create a new one and run `scripts/restore_backup.py --apply` |
| More → Setup says "public anon key" | Set `SUPABASE_KEY` on Vercel to the secret key |
| "Sync history & job leads" warning | Run `supabase_schema.sql` |
| Sync says the worker is unreachable | Free Render workers sleep; the first sync after a while takes about a minute |
| `invalid_grant` from Gmail | Run `python main.py --dry-run --limit 1` locally, then update `GMAIL_TOKEN_JSON` on Render |
| Gemini 503 "high demand" in logs | Normal: the pipeline switches to Gemini Flash Lite, then to keywords |
| Android won't install the update | APKs before v2.0 were signed with a different key: uninstall the old app once |
| `pytest` opens an unrelated window | A personal script named `py.py` in your Python install folder shadows pytest's `py` module — rename it |

## 📄 License

MIT — see [LICENSE](LICENSE).
