/**
 * Cabinet → BFF proxy for AI promo enhancement. The browser POSTs `{ draft }`
 * here; the cabinet authenticates the editor (session cookie) and forwards the
 * call to promo-bff `/enhance-promo` with the advertiserId set to the admin
 * username (the cabinet has no per-promo owner; see session notes). The BFF
 * envelope is returned to the browser unchanged.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { env } from '@/env';
import { AiBffError, callEnhanceBff } from '@/lib/ai-bff';

export const runtime = 'nodejs';

interface CabinetEnhanceBody {
  draft?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: CabinetEnhanceBody;
  try {
    body = (await req.json()) as CabinetEnhanceBody;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || typeof body.draft !== 'object' || body.draft === null || Array.isArray(body.draft)) {
    return NextResponse.json({ error: 'invalid_draft' }, { status: 400 });
  }

  // The session cookie is opaque; we use the configured admin username as the
  // attribution / rate-limit key (one admin per cabinet today).
  const advertiserId = env.adminUser || 'cabinet';

  try {
    const result = await callEnhanceBff({ advertiserId, draft: body.draft as Record<string, unknown> });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof AiBffError) {
      if (err.code === 'bff_disabled') return NextResponse.json({ error: 'ai_disabled' }, { status: 503 });
      if (err.code === 'timeout') return NextResponse.json({ error: 'ai_timeout' }, { status: 504 });
      if (err.code === 'unauthorized') return NextResponse.json({ error: 'ai_unauthorized' }, { status: 502 });
      return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 });
    }
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 });
  }
}
