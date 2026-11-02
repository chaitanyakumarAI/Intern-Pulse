import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { isDbConfigured } from '@/lib/db';
import { cloudSyncInfo, dailyLimit, localProjectRoot } from '@/lib/server-state';
import { workerFetch } from '@/lib/worker';
import type { SyncInfo } from '@/lib/types';

// Room for a Render free-tier cold start when the sync is handed to the worker.
export const maxDuration = 60;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

// ── Local dev: the Python pipeline sits next to this app ──────────────────────

function readLocalStatus(root: string): SyncInfo {
  try {
    const status = JSON.parse(fs.readFileSync(path.join(root, 'data', 'pipeline_status.json'), 'utf-8'));
    const startedRecently = status.start_time && Date.now() - new Date(status.start_time).getTime() < 10 * 60 * 1000;
    return {
      running: Boolean(status.is_running && startedRecently),
      lastRun: status.last_run_time
        ? { started_at: status.last_run_time, finished_at: status.last_run_time, status: status.error ? 'error' : 'success', trigger: null, stats: status.stats ?? null, error: status.error ?? null }
        : null,
      quota: null,
    };
  } catch {
    return { running: false, lastRun: null, quota: null };
  }
}

function startLocal(root: string, days: string | undefined, force: boolean) {
  const python = [path.join(root, '.venv', 'Scripts', 'python.exe'), path.join(root, '.venv', 'bin', 'python')].find(fs.existsSync)
    ?? (process.platform === 'win32' ? 'python' : 'python3');
  const args = ['main.py', ...(days ? ['--days', days] : []), ...(force ? ['--force'] : [])];
  const child = spawn(python, args, { cwd: root, detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', (err) => console.error('Failed to start the pipeline:', err.message));
  child.unref();
}

// ── Status ────────────────────────────────────────────────────────────────────

async function currentSync(): Promise<SyncInfo> {
  if (isDbConfigured()) {
    const info = await cloudSyncInfo().catch(() => null);
    if (info) return info;
  }
  const root = localProjectRoot();
  if (root) return readLocalStatus(root);
  return { running: false, lastRun: null, quota: null };
}

export async function GET() {
  return json(await currentSync());
}

// ── Start a sync ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const rawDays = body?.days == null ? '' : String(body.days).trim();
  if (rawDays && !/^\d{1,4}$/.test(rawDays)) {
    return json({ ok: false, message: 'days must be a whole number.' }, 400);
  }
  const days = rawDays && rawDays !== '0' ? rawDays : undefined;
  const force = body?.force === true;

  const sync = await currentSync();
  if (sync.running) return json({ ok: false, message: 'A sync is already running.', sync }, 409);
  if (sync.quota && sync.quota.remaining <= 0 && !force) {
    return json({ ok: false, message: `Daily limit reached (${sync.quota.limit} syncs). Resets at 00:00 UTC.`, sync }, 429);
  }

  const root = localProjectRoot();
  if (root) {
    startLocal(root, days, force);
    return json({ ok: true, message: 'Sync started.' });
  }

  try {
    const query = new URLSearchParams({ trigger: 'app' });
    if (days) query.set('days', days);
    if (force) query.set('force', 'true');
    const res = await workerFetch(`/api/sync?${query}`, { method: 'POST' });
    if (res.status === 401) {
      return json({ ok: false, message: 'The sync worker rejected the request: set the same SYNC_API_TOKEN on Vercel and Render.' }, 502);
    }
    if (!res.ok) return json({ ok: false, message: `The sync worker returned ${res.status}.` }, 502);
    return json({ ok: true, message: 'Sync started.', limit: dailyLimit() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, message: `Could not reach the sync worker (${message}). It may be waking up; try again in a minute.` }, 502);
  }
}
