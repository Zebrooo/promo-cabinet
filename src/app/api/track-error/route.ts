import { NextResponse, type NextRequest } from 'next/server';
import { reportErrorToBff } from '@/lib/bff-client';
import { isAuthed } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SHORT = 128, MAX_ROUTE = 512, MAX_STACK = 16384, MAX_CONTEXT = 4096;

const short = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

/** Контекст — плоский объект; оверсайз режем целиком, а не пропускаем в BFF. */
function boundedContext(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  try {
    const json = JSON.stringify(v);
    return json.length > MAX_CONTEXT ? { truncated: true } : (JSON.parse(json) as Record<string, unknown>);
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; }
  catch { try { b = JSON.parse(await req.text()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false }, { status: 400 }); } }

  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 2048) : '';
  if (!message) return NextResponse.json({ ok: false, error: 'missing_message' }, { status: 400 });
  const ua = req.headers.get('user-agent');
  try {
    await reportErrorToBff({
      service: 'promo-cabinet',
      source: short(b.source, MAX_SHORT) ?? 'browser',
      message,
      errorType: short(b.errorType, MAX_SHORT),
      stack: typeof b.stack === 'string' ? b.stack.slice(0, MAX_STACK) : null,
      route: short(b.route, MAX_ROUTE),
      sessionId: short(b.session_id, MAX_SHORT),
      userAgent: ua ? ua.slice(0, 512) : null,
      context: boundedContext(b.context),
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'bff_unreachable' });
  }
  return NextResponse.json({ ok: true });
}
