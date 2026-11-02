# Mobile overhaul — plan and decisions

Goal: InternPulse should feel like a fast, reliable personal app on an Android phone.

## Decisions

| Area | Before | After | Why |
|---|---|---|---|
| Pipeline runner | GitHub Actions and Render both ran it, each with its own secrets | Render runs it; a GitHub Actions cron only wakes it | One set of secrets, one code path |
| Pipeline state | Local JSON files, lost on every Render restart and CI run | Supabase tables, with local files as the fallback | Survives restarts; already-handled emails are skipped before any API call |
| Sync status | Dashboard polled Render every 10 s | Dashboard reads `sync_runs` from Supabase | Doesn't keep a sleeping worker awake |
| Scheduling | Render hourly loop + daily cron | Cron every 3 hours | Waking the worker must not start a sync by itself |
| LLM output | JSON mode with the schema described in the prompt | `response_schema` with enums; email text marked as untrusted data | Allowed values enforced by the API; prompt-injection hardening |
| Stored data | Interview dates and digests were discarded | `interview_date`, last email subject and link, and an `opportunities` table | This is what you want to see on your phone |
| UI | Desktop dashboard with 3D orbs, drag-and-drop Kanban and charts | Single-page, mobile-first app with bottom tabs and bottom sheets | Touch-friendly, far less JavaScript |
| Data loading | Spinner, then network | Show cache instantly, refresh in the background; offline support | Opens instantly |
| Database client | `@supabase/supabase-js` + `ws` | Small server-only PostgREST helper | Fewer dependencies; no database key near the browser |
| Failure mode | Fake demo jobs when the DB fails | An explicit error, plus the last cached data | Never show invented applications |
| Android | Default icon, debug settings on, new signing key per build | Real icon, dark bars, offline page, stable signing key, direct APK link | Updates install over the old version |
| Telegram | Python long-poll bot and Next.js webhook, duplicated | Webhook only, plus a small registration script | One implementation |

## Removed

`notion_updater.py`, `clean_notion_duplicates.py`, `setup_notion_db.py`, `diagnose.py`, `reprocess.py`,
`migrate_notion_to_supabase.py`, `dashboard.py`, `scheduler.py`, `workday_scraper.py`, `telegram_bot.py`,
`test_integration.py` (it wrote test rows into the real database), and the `three`, `@react-three/*`,
`framer-motion`, `recharts`, `@supabase/supabase-js` and `ws` packages.

## Known trade-offs kept on purpose

- **One row per company.** Several roles at one company share a row. Email role text is too noisy to key on.
- **Sequential processing.** The free Gemini tier allows 15 requests a minute, so parallelism would gain nothing.
- **Render free tier.** The first sync after idle waits about a minute for the worker to wake.
