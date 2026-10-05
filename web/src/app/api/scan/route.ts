import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

function getProjectRoot(): string {
  if (fs.existsSync(path.join(process.cwd(), 'main.py'))) {
    return process.cwd();
  }
  const parent = path.resolve(process.cwd(), '..');
  if (fs.existsSync(path.join(parent, 'main.py'))) {
    return parent;
  }
  return process.cwd();
}

function getPythonExecutable(projectRoot: string): string {
  const winVenv = path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(winVenv)) return winVenv;
  const unixVenv = path.join(projectRoot, '.venv', 'bin', 'python');
  if (fs.existsSync(unixVenv)) return unixVenv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function getStatusFilePath(projectRoot: string): string {
  return path.join(projectRoot, 'data', 'pipeline_status.json');
}

function getQuotaFilePath(projectRoot: string): string {
  return path.join(projectRoot, 'data', 'sync_quota.json');
}

export interface SyncQuota {
  date: string;
  syncs_today: number;
  daily_limit: number;
  remaining: number;
  last_sync_time: string | null;
  resets_at: string;
}

function getDailySyncQuota(projectRoot: string): SyncQuota {
  const quotaFile = getQuotaFilePath(projectRoot);
  const today = new Date().toISOString().split('T')[0];
  const limit = parseInt(process.env.DAILY_SYNC_LIMIT || '5', 10);

  const defaultQuota: SyncQuota = {
    date: today,
    syncs_today: 0,
    daily_limit: limit,
    remaining: limit,
    last_sync_time: null,
    resets_at: '00:00 UTC',
  };

  if (!fs.existsSync(quotaFile)) {
    try {
      const dataDir = path.dirname(quotaFile);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(quotaFile, JSON.stringify(defaultQuota, null, 2), 'utf-8');
    } catch {}
    return defaultQuota;
  }

  try {
    const raw = fs.readFileSync(quotaFile, 'utf-8');
    const data = JSON.parse(raw);

    // Day rollover check
    if (data.date !== today) {
      const rolled: SyncQuota = {
        date: today,
        syncs_today: 0,
        daily_limit: limit,
        remaining: limit,
        last_sync_time: data.last_sync_time || null,
        resets_at: '00:00 UTC',
      };
      try {
        fs.writeFileSync(quotaFile, JSON.stringify(rolled, null, 2), 'utf-8');
      } catch {}
      return rolled;
    }

    const syncsToday = parseInt(data.syncs_today || '0', 10);
    return {
      date: today,
      syncs_today: syncsToday,
      daily_limit: limit,
      remaining: Math.max(0, limit - syncsToday),
      last_sync_time: data.last_sync_time || null,
      resets_at: '00:00 UTC',
    };
  } catch {
    return defaultQuota;
  }
}

export async function GET() {
  const projectRoot = getProjectRoot();
  const statusFile = getStatusFilePath(projectRoot);
  const quota = getDailySyncQuota(projectRoot);

  if (!fs.existsSync(statusFile)) {
    return NextResponse.json({
      is_running: false,
      status: 'idle',
      last_run_time: null,
      stats: null,
      quota,
    });
  }

  try {
    const content = fs.readFileSync(statusFile, 'utf-8');
    const data = JSON.parse(content);
    return NextResponse.json({ ...data, quota });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      is_running: false,
      status: 'error',
      error: message,
      quota,
    });
  }
}

export async function POST(req: Request) {
  const projectRoot = getProjectRoot();
  const statusFile = getStatusFilePath(projectRoot);
  const pythonPath = getPythonExecutable(projectRoot);
  const quota = getDailySyncQuota(projectRoot);

  let daysParam: string | undefined;
  let force = false;
  try {
    const body = await req.json();
    if (body?.days !== undefined && body?.days !== null && body.days !== 'ALL') {
      const parsedDays = parseInt(String(body.days).trim(), 10);
      if (isNaN(parsedDays) || parsedDays <= 0 || parsedDays > 3650 || String(parsedDays) !== String(body.days).trim()) {
        return NextResponse.json(
          {
            ok: false,
            error: 'INVALID_DAYS_PARAMETER',
            message: 'Invalid `days` parameter. Must be a positive integer between 1 and 3650, or "ALL".',
          },
          { status: 400 }
        );
      }
      daysParam = String(parsedDays);
    }
    if (body?.force === true) {
      force = true;
    }
  } catch {}

  // 1. Enforce Daily Sync Quota Limit
  if (quota.remaining <= 0 && !force) {
    return NextResponse.json(
      {
        ok: false,
        error: 'DAILY_LIMIT_REACHED',
        message: `Daily Gmail sync limit reached (${quota.syncs_today}/${quota.daily_limit}). Resets at ${quota.resets_at}.`,
        quota,
      },
      { status: 429 }
    );
  }

  // 2. Check if already running
  if (fs.existsSync(statusFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      if (existing.is_running) {
        // Prevent stale locks if running for more than 10 minutes
        const startTime = existing.start_time ? new Date(existing.start_time).getTime() : 0;
        const now = Date.now();
        if (now - startTime < 10 * 60 * 1000) {
          return NextResponse.json(
            { ok: false, message: 'Scan is already currently running.', status: existing, quota },
            { status: 409 }
          );
        }
      }
    } catch {
      // Ignore parse errors on corrupted status file
    }
  }

  // 2. Mark as running
  const initialStatus = {
    is_running: true,
    status: 'running',
    start_time: new Date().toISOString(),
    days_filter: daysParam || 'ALL',
    stats: { fetched: 0, new: 0, processed: 0, created: 0, updated: 0, skipped: 0, errors: 0 },
  };

  try {
    const dataDir = path.dirname(statusFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(statusFile, JSON.stringify(initialStatus, null, 2), 'utf-8');
  } catch (err: unknown) {
    console.error('Failed to write initial status file:', err);
  }

  // 3. Spawn background pipeline process
  try {
    const spawnEnv = {
      ...process.env,
      ...(daysParam ? { GMAIL_DAYS: daysParam } : {}),
    };

    const args = ['main.py', ...(daysParam ? ['--days', daysParam] : []), ...(force ? ['--force'] : [])];
    const child = spawn(pythonPath, args, {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: spawnEnv,
    });
    child.unref();

    return NextResponse.json({
      ok: true,
      message: daysParam ? `Inbox scan (last ${daysParam} days) initiated.` : 'Full inbox scan initiated successfully.',
      status: initialStatus,
      quota,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Revert status on spawn error
    try {
      fs.writeFileSync(
        statusFile,
        JSON.stringify({ is_running: false, status: 'error', error: message }, null, 2),
        'utf-8'
      );
    } catch {}

    return NextResponse.json(
      { ok: false, message: `Failed to start scan process: ${message}` },
      { status: 500 }
    );
  }
}
