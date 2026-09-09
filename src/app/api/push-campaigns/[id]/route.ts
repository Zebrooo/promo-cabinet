import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { deletePushCampaign, getPushCampaign } from '@/lib/bff-client';

export const runtime = 'nodejs';

type Ctx = { params: { id: string } };

const ID_RE = /^[a-z0-9_-]{1,64}$/i;

/** Одна пуш-кампания / удаление — прокси в BFF (см. ../route.ts). */
export async function GET(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const { status, body } = await getPushCampaign(params.id);
    return NextResponse.json(body, { status });
  } catch {
    return NextResponse.json({ error: 'bff_unreachable' }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const { status, body } = await deletePushCampaign(params.id);
    return NextResponse.json(body, { status });
  } catch {
    return NextResponse.json({ error: 'bff_unreachable' }, { status: 502 });
  }
}
