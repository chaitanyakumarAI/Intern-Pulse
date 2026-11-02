import { NextResponse } from 'next/server';
import { loadAppState } from '@/lib/server-state';

/** Everything the app shows, in one round trip. */
export async function GET() {
  try {
    return NextResponse.json(await loadAppState(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to load app state:', message);
    return NextResponse.json({ error: `Could not load your data: ${message}` }, { status: 502 });
  }
}
