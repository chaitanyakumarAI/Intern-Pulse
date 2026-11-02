import fs from 'fs';
import path from 'path';
import { db, dbJson, isDbConfigured, keyKind } from '@/lib/db';
import { isAuthEnabled } from '@/lib/auth';
import type { AppState, Application, Opportunity, SyncInfo, SyncRun } from '@/lib/types';

const STALE_RUN_MS = 20 * 60 * 1000; // matches cloud_state.STALE_RUN_MINUTES

export function dailyLimit(): number {
  return parseInt(process.env.DAILY_SYNC_LIMIT || '12', 10);
}

function todayStart(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
}

function isRunning(run: SyncRun | null): boolean {
  return Boolean(run && run.status === 'running' && Date.now() - new Date(run.started_at).getTime() < STALE_RUN_MS);
}

/** Sync status from the sync_runs table, or null if that table doesn't exist yet. */
export async function cloudSyncInfo(): Promise<SyncInfo | null> {
  const [lastRes, todayRes] = await Promise.all([
    db('sync_runs?select=started_at,finished_at,status,trigger,stats,error&order=started_at.desc&limit=1'),
    db(`sync_runs?select=id&status=in.(running,success)&started_at=gte.${todayStart()}`),
  ]);
  if (!lastRes.ok || !todayRes.ok) return null;
  const lastRun = ((await lastRes.json()) as SyncRun[])[0] ?? null;
  const used = ((await todayRes.json()) as unknown[]).length;
  const limit = dailyLimit();
  return { running: isRunning(lastRun), lastRun, quota: { used, limit, remaining: Math.max(0, limit - used) } };
}

/** Project root when the Python pipeline sits next to this app (local dev), else null. */
export function localProjectRoot(): string | null {
  for (const dir of [process.cwd(), path.resolve(process.cwd(), '..')]) {
    if (fs.existsSync(path.join(dir, 'main.py'))) return dir;
  }
  return null;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/** Local dev without Supabase: read what the Python pipeline wrote to data/. */
function localState(root: string): AppState {
  const applications = readJson<Application[]>(path.join(root, 'data', 'canonical_applications.json')) ?? [];
  const status = readJson<{ is_running?: boolean; last_run_time?: string; stats?: Record<string, number>; error?: string }>(
    path.join(root, 'data', 'pipeline_status.json'),
  );
  const quota = readJson<{ syncs_today?: number }>(path.join(root, 'data', 'sync_quota.json'));
  const used = quota?.syncs_today ?? 0;
  return {
    applications,
    opportunities: [],
    sync: {
      running: Boolean(status?.is_running),
      lastRun: status?.last_run_time
        ? { started_at: status.last_run_time, finished_at: status.last_run_time, status: status.error ? 'error' : 'success', trigger: null, stats: status.stats ?? null, error: status.error ?? null }
        : null,
      quota: { used, limit: dailyLimit(), remaining: Math.max(0, dailyLimit() - used) },
    },
    setup: { database: 'none', cloudState: false, auth: isAuthEnabled() },
    source: 'local',
  };
}

export async function loadAppState(): Promise<AppState> {
  const setupBase = { auth: isAuthEnabled() };
  if (!isDbConfigured()) {
    const root = localProjectRoot();
    if (root) return localState(root);
    return {
      applications: [], opportunities: [], sync: { running: false, lastRun: null, quota: null },
      setup: { ...setupBase, database: 'none', cloudState: false }, source: 'none',
      error: 'No database configured. Set SUPABASE_URL and SUPABASE_KEY.',
    };
  }

  const applications = await dbJson<Application[]>('applications?select=*&order=last_checked.desc.nullslast');
  const [oppRes, sync] = await Promise.all([
    db('opportunities?select=*&status=neq.dismissed&order=first_seen.desc&limit=60'),
    cloudSyncInfo(),
  ]);
  const opportunities = oppRes.ok ? ((await oppRes.json()) as Opportunity[]) : [];

  return {
    applications,
    opportunities,
    sync: sync ?? { running: false, lastRun: null, quota: null },
    setup: { ...setupBase, database: keyKind(), cloudState: sync !== null },
    source: 'database',
  };
}
