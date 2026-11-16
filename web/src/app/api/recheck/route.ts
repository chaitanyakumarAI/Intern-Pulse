import { NextResponse } from 'next/server';
import { cloudSyncInfo } from '@/lib/server-state';
import { workerFetch } from '@/lib/worker';

// Room for a Render free-tier cold start.
export const maxDuration = 60;

/** Ask the worker to re-check "Needs Review" applications with Gemini. */
export async function POST() {
  const sync = await cloudSyncInfo().catch(() => null);
  if (sync?.running) {
    return NextResponse.json({ ok: false, message: 'A sync is running. Try again when it finishes.' }, { status: 409 });
  }
  try {
    const res = await workerFetch('/api/recheck', { method: 'POST' });
    if (res.status === 401) {
      return NextResponse.json({ ok: false, message: 'The worker rejected the request: set the same SYNC_API_TOKEN on Vercel and Render.' }, { status: 502 });
    }
    if (!res.ok) return NextResponse.json({ ok: false, message: `The worker returned ${res.status}.` }, { status: 502 });
    return NextResponse.json({ ok: true, message: 'Re-checking with AI…' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: `Could not reach the worker (${message}). It may be waking up; try again in a minute.` }, { status: 502 });
  }
}
