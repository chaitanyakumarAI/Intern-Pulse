import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE, dashboardPassword, isAuthEnabled, safeEqual, sessionToken } from '@/lib/auth';

export async function POST(req: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true, message: 'Login is not enabled.' });
  }
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!safeEqual(password, dashboardPassword())) {
    await new Promise((resolve) => setTimeout(resolve, 800)); // slow down guessing
    return NextResponse.json({ ok: false, message: 'Wrong password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(dashboardPassword()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
