import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, isAuthEnabled, isValidSession } from '@/lib/auth';

// Reachable without a session: the login flow, and Telegram's webhook (it has its own secret).
const PUBLIC_PATHS = ['/login', '/api/login', '/api/telegram/webhook'];

export async function proxy(request: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Skip Next.js internals and static files (icons, images, manifest, robots, sitemap).
  matcher: ['/((?!_next/static|_next/image|assets/|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};
