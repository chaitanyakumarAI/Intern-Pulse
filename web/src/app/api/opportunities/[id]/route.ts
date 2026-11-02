import { NextResponse } from 'next/server';
import { DbError, dbJson, isDbConfigured, isUuid } from '@/lib/db';

const OPPORTUNITY_STATUSES = new Set(['new', 'saved', 'dismissed']);

/** Save or dismiss a job opportunity. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDbConfigured()) return NextResponse.json({ error: 'No database configured.' }, { status: 503 });
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (!OPPORTUNITY_STATUSES.has(body.status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });

  try {
    const rows = await dbJson<unknown[]>(`opportunities?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: body.status }),
      prefer: 'return=representation',
    });
    if (!rows?.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof DbError ? 502 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}
