/**
 * Client for the Python sync worker on Render (server.py).
 * Used wherever Python can't run next to Next.js — e.g. on Vercel, and therefore in the Android app.
 */
export const DEFAULT_WORKER_URL = 'https://ai-job-tracker-worker.onrender.com';

export function workerUrl(): string {
  return (process.env.RENDER_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, '');
}

/** fetch() against the worker, with the shared SYNC_API_TOKEN and a timeout (free-tier cold starts take ~50 s). */
export async function workerFetch(path: string, init: RequestInit = {}, timeoutMs = 55_000): Promise<Response> {
  const token = process.env.SYNC_API_TOKEN;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${workerUrl()}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
}
