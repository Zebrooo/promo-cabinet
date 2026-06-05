import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * Cheap edge gate: redirect unauthenticated page requests to /login and 401 unauthed
 * API calls. This only checks cookie PRESENCE (the Edge runtime can't run node:crypto);
 * the authoritative signature check happens in node route handlers + server components
 * (isAuthed / requireSession). /api/login is always allowed.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (pathname === '/api/login') return NextResponse.next();
  // /api/img/* — публичный proxy для картинок промо. Бакет config приватный,
  // прямого CDN URL нет; abkhaz-auto и любой консьюмер каталога должны
  // загружать <img src="/api/img/promo-uploads/..."> без сессии cabinet'а.
  // Route handler сам guards на разрешённый префикс (promo-uploads/).
  if (pathname.startsWith('/api/img/')) return NextResponse.next();

  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasCookie) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Build the redirect from the forwarded host/proto so it points at the PUBLIC origin
  // when behind a reverse proxy / tunnel. `req.url` normalizes to the internal bind
  // (e.g. localhost:PORT), which would send the browser to an unreachable address.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const base = host ? `${proto}://${host}` : req.url;
  return NextResponse.redirect(new URL('/login', base));
}

export const config = {
  matcher: ['/cabinet/:path*', '/api/:path*'],
};
