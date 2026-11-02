-- ==============================================================================
-- InternPulse database schema
-- Safe to run more than once: use it for a fresh install and for upgrades.
-- Supabase Dashboard -> SQL Editor -> New Query -> paste -> Run
-- ==============================================================================

-- 1. Applications: one row per company
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company TEXT NOT NULL,
    company_slug TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'Candidate / Intern',
    status TEXT NOT NULL DEFAULT 'Applied',
    platform TEXT DEFAULT 'Direct Email',
    applied_date TIMESTAMPTZ DEFAULT now(),
    last_checked TIMESTAMPTZ DEFAULT now(),
    application_link TEXT,
    email_id TEXT,
    scam_risk TEXT DEFAULT 'Low',
    risk_notes TEXT DEFAULT '',
    prep_sheet TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS interview_date TIMESTAMPTZ;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS last_subject TEXT;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS last_gmail_id TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_company_slug ON public.applications (company_slug);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_last_checked ON public.applications (last_checked DESC);
CREATE INDEX IF NOT EXISTS idx_applications_scam_risk ON public.applications (scam_risk);

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_applications_updated_at ON public.applications;
CREATE TRIGGER trigger_applications_updated_at
BEFORE UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- 2. Job opportunities found in digest emails
CREATE TABLE IF NOT EXISTS public.opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dedupe_key TEXT NOT NULL UNIQUE,
    company TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Candidate / Intern',
    link TEXT,
    platform TEXT,
    scam_risk TEXT DEFAULT 'Unknown',
    risk_notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',      -- new | saved | dismissed
    first_seen TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opportunities_first_seen ON public.opportunities (first_seen DESC);

-- 3. Pipeline state: survives worker restarts
CREATE TABLE IF NOT EXISTS public.processed_emails (
    gmail_id TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_research (
    company_key TEXT PRIMARY KEY,
    scam_risk TEXT,
    risk_notes TEXT DEFAULT '',
    prep_sheet TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger TEXT DEFAULT 'manual',           -- manual | app | schedule | telegram
    status TEXT NOT NULL DEFAULT 'running',  -- running | success | error
    days_filter TEXT,
    stats JSONB,
    error TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON public.sync_runs (started_at DESC);

-- New tables are private: RLS on with no policies, so only the secret key can use them.
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
