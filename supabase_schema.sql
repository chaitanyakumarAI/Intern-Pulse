-- ==============================================================================
-- InternPulse Supabase Database Schema
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. Create applications table
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

-- 2. Indexes for fast lookups and sorting
CREATE INDEX IF NOT EXISTS idx_applications_company_slug ON public.applications (company_slug);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_last_checked ON public.applications (last_checked DESC);
CREATE INDEX IF NOT EXISTS idx_applications_scam_risk ON public.applications (scam_risk);

-- 3. Trigger to automatically update updated_at timestamp
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

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Allow public read and full access for service key and anon operations
DROP POLICY IF EXISTS "Allow read access to all users" ON public.applications;
CREATE POLICY "Allow read access to all users" ON public.applications
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow full access for authenticated and service roles" ON public.applications;
CREATE POLICY "Allow full access for authenticated and service roles" ON public.applications
    FOR ALL USING (true) WITH CHECK (true);
