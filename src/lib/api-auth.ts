import type { NextRequest } from 'next/server';
import { env } from '@/env';
import { SESSION_COOKIE, verifySessionToken } from './auth';

/** True when the request carries a valid signed session cookie. */
export function isAuthed(req: NextRequest): boolean {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, env.sessionSecret);
}
