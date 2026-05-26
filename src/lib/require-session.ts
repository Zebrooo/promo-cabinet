import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/env';
import { SESSION_COOKIE, verifySessionToken } from './auth';

/** Server-component guard: redirects to /login unless a valid session cookie is present. */
export function requireSession(): void {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token, env.sessionSecret)) redirect('/login');
}
