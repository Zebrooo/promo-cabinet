import { NextResponse } from 'next/server';
import { reportErrorToBff } from '@/lib/bff-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; }
  catch { try { b = JSON.parse(await req.text()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false }, { status: 400 }); } }

  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 2048) : '';
  if (!message) return NextResponse.json({ ok: false, error: 'missing_message' }, { status: 400 });
  const ua = req.headers.get('user-agent');
  try {
    await reportErrorToBff({
      service: 'promo-cabinet',
      source: typeof b.source === 'string' ? b.source : 'browser',
      message,
      errorType: typeof b.errorType === 'string' ? b.errorType : null,
      stack: typeof b.stack === 'string' ? b.stack.slice(0, 16384) : null,
      route: typeof b.route === 'string' ? b.route : null,
      sessionId: typeof b.session_id === 'string' ? b.session_id : null,
      userAgent: ua ? ua.slice(0, 512) : null,
      context: typeof b.context === 'object' && b.context ? (b.context as Record<string, unknown>) : {},
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'bff_unreachable' });
  }
  return NextResponse.json({ ok: true });
}
