import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/env';
import { SESSION_COOKIE, createSessionToken, SESSION_MAX_AGE_MS } from '@/lib/auth';

export const runtime = 'nodejs';

const bodySchema = z.object({ user: z.string(), password: z.string() });

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // Fail closed on missing config: empty admin creds would let `{user:'',password:''}`
  // pass safeEqual('',''), and an empty SESSION_SECRET yields forgeable tokens.
  if (!env.adminUser || !env.adminPassword || !env.sessionSecret) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  const ok = safeEqual(parsed.user, env.adminUser) && safeEqual(parsed.password, env.adminPassword);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(env.sessionSecret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
  return res;
}
