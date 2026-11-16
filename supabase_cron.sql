-- ==============================================================================
-- InternPulse: reliable sync schedule from Supabase itself
--
-- GitHub Actions only fires scheduled workflows when it has spare capacity
-- (about 3 times a day instead of 8 here). Supabase's pg_cron runs on time, and
-- the regular activity also keeps a free project from being paused.
--
-- Supabase Dashboard -> SQL Editor -> New Query -> paste -> Run. Safe to re-run.
-- If you set SYNC_API_TOKEN on Render, put it in the Authorization header below.
-- ==============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Replace an older copy of the job if this script is run again.
select cron.unschedule(jobid) from cron.job where jobname = 'internpulse-sync';

-- Every 3 hours at :20. The worker may be asleep (free tier), so allow 60 s to wake.
select cron.schedule(
  'internpulse-sync',
  '20 */3 * * *',
  $$
  select net.http_post(
    url := 'https://ai-job-tracker-worker.onrender.com/api/sync?trigger=schedule&days=7',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    -- with a token: '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_TOKEN"}'::jsonb
    timeout_milliseconds := 60000
  );
  $$
);

-- Check it: the job, then its recent runs.
select jobid, jobname, schedule from cron.job where jobname = 'internpulse-sync';
