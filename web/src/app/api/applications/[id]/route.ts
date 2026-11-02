import { NextResponse } from 'next/server';
import { DbError, dbJson, isDbConfigured, isUuid } from '@/lib/db';
import { EDITABLE_STATUSES } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

function guard(id: string) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'No database configured.' }, { status: 503 });
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  return null;
}

function failure(err: unknown) {
  const status = err instanceof DbError ? 502 : 500;
  return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
}

/** Change an application's status and/or notes. */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const blocked = guard(id);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const update: Record<string, string> = {};
  if (typeof body.status === 'string') {
    if (!EDITABLE_STATUSES.has(body.status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
    update.status = body.status;
  }
  if (typeof body.notes === 'string') update.notes = body.notes.slice(0, 4000);
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  update.last_checked = new Date().toISOString();

  try {
    const rows = await dbJson<unknown[]>(`applications?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
      prefer: 'return=representation',
    });
    if (!rows?.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ ok: true, application: rows[0] });
  } catch (err) {
    return failure(err);
  }
}

/** Delete an application (e.g. a test row or a newsletter stored by mistake). */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const blocked = guard(id);
  if (blocked) return blocked;
  try {
    const rows = await dbJson<unknown[]>(`applications?id=eq.${id}`, { method: 'DELETE', prefer: 'return=representation' });
    if (!rows?.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failure(err);
  }
}
