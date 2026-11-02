/**
 * Minimal server-only Supabase (PostgREST) client.
 * The key never leaves the server: pages talk to /api routes, which call this.
 */

function dbUrl(): string {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
}

function dbKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();
}

export function isDbConfigured(): boolean {
  const url = dbUrl();
  const key = dbKey();
  return Boolean(url && key && !url.startsWith('your_') && !key.startsWith('your_'));
}

/** 'secret' keys bypass row-level security; 'public' (anon/publishable) keys don't. */
export function keyKind(): 'secret' | 'public' | 'none' {
  const key = dbKey();
  if (!isDbConfigured()) return 'none';
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) return 'public';
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return payload.role === 'service_role' ? 'secret' : 'public';
  } catch {
    return 'public';
  }
}

export class DbError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Call a table endpoint, e.g. db('applications?select=*'). */
export async function db(path: string, init: RequestInit & { prefer?: string } = {}): Promise<Response> {
  const { prefer, headers, ...rest } = init;
  const key = dbKey();
  const h = new Headers(headers);
  h.set('apikey', key);
  h.set('Authorization', `Bearer ${key}`);
  h.set('Content-Type', 'application/json');
  if (prefer) h.set('Prefer', prefer);
  return fetch(`${dbUrl()}/rest/v1/${path}`, { ...rest, headers: h, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
}

/** Like db(), but parses JSON and throws DbError on failure. */
export async function dbJson<T>(path: string, init?: RequestInit & { prefer?: string }): Promise<T> {
  const res = await db(path, init);
  if (!res.ok) throw new DbError(res.status, (await res.text()).slice(0, 300));
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Validate a row id from a URL before putting it into a filter. */
export function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
