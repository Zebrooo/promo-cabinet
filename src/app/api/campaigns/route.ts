import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { listCampaignsForModeration } from '@/lib/bff-client';

export const runtime = 'nodejs';

/**
 * Очередь рекламных кампаний на подтверждение + история решений. Данные живут
 * в abkhaz-Supabase за promo-bff (/campaign-moderation/list) — кабинет
 * пробрасывает ответ 1-в-1: BFF сам отдаёт осмысленные коды (503
 * moderation_not_configured, 502 moderation_unavailable).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { status, body } = await listCampaignsForModeration();
    return NextResponse.json(body, { status });
  } catch {
    return NextResponse.json({ error: 'bff_unreachable' }, { status: 502 });
  }
}
