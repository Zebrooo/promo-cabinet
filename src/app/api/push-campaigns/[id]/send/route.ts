import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { sendPushCampaign } from '@/lib/bff-client';

export const runtime = 'nodejs';

type Ctx = { params: { id: string } };

const ID_RE = /^[a-z0-9_-]{1,64}$/i;

/**
 * «Отправить пуш»: BFF рассылает через витрину (FCM всем пользователям с
 * токенами) и переводит кампанию в `sent`. Коды BFF пробрасываем как есть:
 * 409 already_sent, 503 push_not_configured, 502 push_broadcast_failed
 * (черновик остаётся с lastSendError — можно повторить).
 */
export async function POST(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const { status, body } = await sendPushCampaign(params.id);
    return NextResponse.json(body, { status });
  } catch {
    return NextResponse.json({ error: 'bff_unreachable' }, { status: 502 });
  }
}
