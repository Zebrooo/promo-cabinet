import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { promoSchema } from '@/lib/schema';
import { mutatePool, readState } from '@/lib/catalogue';
import { addPromo, DuplicateIdError } from '@/lib/mutations';
import { readEnvMode } from '@/lib/env-mode';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { promos, queues } = await readState(readEnvMode(req.cookies));
    return NextResponse.json({ promos, queues });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let promo;
  try {
    promo = promoSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_promo' }, { status: 400 });
  }

  // Режим — ТОЛЬКО из куки (не из тела запроса), чтобы UI и запись не могли
  // разъехаться, если клиент пришлёт устаревший/подделанный env.
  const envMode = readEnvMode(req.cookies);
  try {
    await mutatePool((promos) => addPromo(promos, promo), envMode);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateIdError) return NextResponse.json({ error: 'duplicate_id' }, { status: 409 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
