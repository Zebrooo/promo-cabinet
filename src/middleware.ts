import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

/**
 * Cheap edge gate: redirect unauthenticated page requests to /login and 401 unauthed
 * API calls. This only checks cookie PRESENCE (the Edge runtime can't run node:crypto);
 * the authoritative signature check happens in node route handlers + server components
 * (isAuthed / requireSession). /api/login is always allowed.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (pathname === '/api/login') return NextResponse.next();

  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasCookie) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/cabinet/:path*', '/api/:path*'],
};
