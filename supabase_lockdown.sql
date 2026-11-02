-- ==============================================================================
-- Removes the old open policies from `applications`, so the public anon key can
-- no longer read or change your data.
--
-- Run this AFTER the app's "More" tab shows "Database key: Secret". If Vercel is
-- still using the public anon key, the dashboard would come back empty.
-- ==============================================================================
DROP POLICY IF EXISTS "Allow read access to all users" ON public.applications;
DROP POLICY IF EXISTS "Allow full access for authenticated and service roles" ON public.applications;
