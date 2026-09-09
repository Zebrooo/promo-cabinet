import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { pushSubscriptionSchema, removePushSubscription, upsertPushSubscription } from '@/lib/push-subscriptions';

export const runtime = 'nodejs';

/**
 * Web Push-подписка браузера админа. POST — сохранить (или обновить по
 * endpoint), DELETE — убрать. Хранится в S3 (push-subscriptions.json);
 * читает его promo-bff при рассылке уведомлений о новых кампаниях.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let sub: z.infer<typeof pushSubscriptionSchema>;
  try {
    sub = pushSubscriptionSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 });
  }

  try {
    const all = await upsertPushSubscription(sub, { userAgent: req.headers.get('user-agent') ?? undefined });
    return NextResponse.json({ ok: true, total: all.length });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

const deleteSchema = z.object({ endpoint: z.string().url().max(2048) });

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof deleteSchema>;
  try {
    body = deleteSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const all = await removePushSubscription(body.endpoint);
    return NextResponse.json({ ok: true, total: all.length });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
