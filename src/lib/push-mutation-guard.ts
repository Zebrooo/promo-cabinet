import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { env } from '@/env';

function firstForwardedValue(value: string | null): string | null {
  const first = value?.split(',')[0]?.trim();
  return first || null;
}

function requestPublicOrigin(req: NextRequest): string | null {
  const host = firstForwardedValue(req.headers.get('x-forwarded-host'))
    ?? firstForwardedValue(req.headers.get('host'));
  const proto = firstForwardedValue(req.headers.get('x-forwarded-proto'))
    ?? req.nextUrl.protocol.replace(':', '');
  if (!host || (proto !== 'https' && proto !== 'http')) return null;
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

export function isTrustedMutationOrigin(req: NextRequest): boolean {
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const supplied = new URL(origin).origin;
    const allowed = new Set<string>([req.nextUrl.origin]);
    const forwarded = requestPublicOrigin(req);
    if (forwarded) allowed.add(forwarded);
    if (env.promoCabinetPublicBase) {
      allowed.add(new URL(env.promoCabinetPublicBase).origin);
    }
    return allowed.has(supplied);
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password: string): boolean {
  if (!env.adminPassword) return false;
  const given = Buffer.from(password);
  const expected = Buffer.from(env.adminPassword);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
