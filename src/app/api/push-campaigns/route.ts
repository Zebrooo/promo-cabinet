import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { listPushCampaigns, savePushCampaign } from '@/lib/bff-client';
import { pushCampaignInputSchema } from '@/lib/push-campaign-schema';

export const runtime = 'nodejs';

/**
 * Push-рассылки: список и сохранение черновика. Данные живут в BFF (S3
 * push-campaigns.json за promo-bff /push-campaigns), кабинет пробрасывает
 * ответ 1-в-1 — BFF сам отдаёт осмысленные коды (404 not_found, 409
 * already_sent, 502 push_campaigns_unavailable). Глобальный режим Прод/Тест
 * на пуши не влияет: получатели — живые пользователи витрины.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { status, body } = await listPushCampaigns();
    return NextResponse.json(body, { status });
  } catch {
    return NextResponse.json({ error: 'bff_unreachable' }, { status: 502 });
  }
}

/** Создать (без id) или обновить (с id) черновик. Тело валидируем здесь той
 *  же схемой, что и форма, — чтобы в BFF не улетал мусор и ошибка приходила
 *  с русскими сообщениями по полям. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_push_campaign' }, { status: 400 });
  }
  const parsed = pushCampaignInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({
      error: 'invalid_push_campaign',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    }, { status: 400 });
  }

  try {
    const { status, body } = await savePushCampaign(parsed.data);
    return NextResponse.json(body, { status });
  } catch {
    return NextResponse.json({ error: 'bff_unreachable' }, { status: 502 });
  }
}
