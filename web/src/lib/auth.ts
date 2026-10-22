/**
 * Single-user dashboard login.
 *
 * When DASHBOARD_PASSWORD is set, every page and API route (except the Telegram
 * webhook and the login endpoints) requires a session cookie. The cookie value is
 * an HMAC of the password, so changing the password signs everyone out.
 */
export const SESSION_COOKIE = 'ip_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days: stay signed in on your phone

export function dashboardPassword(): string {
  return (process.env.DASHBOARD_PASSWORD || '').trim();
}

export function isAuthEnabled(): boolean {
  return dashboardPassword().length > 0;
}

export async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('internpulse-session-v1'));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison (avoids leaking how many characters matched). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!isAuthEnabled()) return true;
  if (!cookieValue) return false;
  return safeEqual(cookieValue, await sessionToken(dashboardPassword()));
}
