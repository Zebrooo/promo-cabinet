import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { listRecentCampaigns } from '@/lib/bff-client';

export const runtime = 'nodejs';

/**
 * Последние новые рекламные кампании, о которых BFF слал пуши. Данные живут
 * в abkhaz-Supabase за promo-bff (/new-campaigns/recent) — кабинет
 * пробрасывает ответ 1-в-1: BFF сам отдаёт осмысленные коды (503
 * campaigns_not_configured, 502 campaigns_unavailable).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { status, body } = await listRecentCampaigns();
    return NextResponse.json(body, { status });
  } catch {
    return NextResponse.json({ error: 'bff_unreachable' }, { status: 502 });
  }
}
