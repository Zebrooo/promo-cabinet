/**
 * Web Push-подписки админов кабинета — JSON в S3 (push-subscriptions.json,
 * тот же бакет и PROMO_KEY_PREFIX, что у promos.json).
 *
 * Кабинет только СОБИРАЕТ подписки: браузер админа через service worker
 * (public/sw.js) получает PushSubscription, и мы кладём её сюда. Сами
 * уведомления шлёт promo-bff — у него VAPID-приватный ключ и поллер новых
 * рекламных кампаний; он читает этот объект при каждой рассылке
 * (admin-notifier.ts). Формат файла — общий контракт двух репозиториев:
 *   { version: 1, subscriptions: [{ endpoint, keys: { p256dh, auth }, createdAt, userAgent? }] }
 *
 * Один объект, read-modify-write, last-write-wins — как promos.json. Подписок
 * единицы (по одной на браузер каждого админа), гонок тут не бывает.
 */
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { env } from '@/env';
import { getS3Client, isNoSuchKey, pushSubscriptionsKey } from './s3';

/** То, что отдаёт браузер из PushSubscription.toJSON() — endpoint push-сервиса
 *  и два ключа шифрования. Только https: push-сервисы иначе не бывают, а
 *  http-endpoint в хранилище — либо мусор, либо попытка увести уведомления. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).refine((u) => u.startsWith('https://'), 'endpoint должен быть https'),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export interface StoredPushSubscription extends PushSubscriptionInput {
  createdAt: string;
  userAgent?: string;
}

const storedSchema = pushSubscriptionSchema.extend({
  createdAt: z.string(),
  userAgent: z.string().max(512).optional(),
});

const fileSchema = z.object({
  version: z.literal(1),
  subscriptions: z.array(z.unknown()),
});

async function readFile(): Promise<StoredPushSubscription[]> {
  let text: string;
  try {
    const res = await getS3Client().send(new GetObjectCommand({ Bucket: env.promoBucket, Key: pushSubscriptionsKey() }));
    text = await res.Body!.transformToString();
  } catch (err) {
    if (isNoSuchKey(err)) return [];
    throw err;
  }
  const parsed = fileSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    console.warn('[push-subscriptions] push-subscriptions.json has an unexpected shape — treating as empty');
    return [];
  }
  // Кривая запись не должна ронять остальные: пропускаем с предупреждением.
  const out: StoredPushSubscription[] = [];
  for (const item of parsed.data.subscriptions) {
    const s = storedSchema.safeParse(item);
    if (s.success) out.push(s.data);
    else console.warn('[push-subscriptions] skipping invalid subscription', { issues: s.error.issues });
  }
  return out;
}

async function writeFile(subscriptions: StoredPushSubscription[]): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.promoBucket,
      Key: pushSubscriptionsKey(),
      Body: JSON.stringify({ version: 1, subscriptions }, null, 2),
      ContentType: 'application/json',
    }),
  );
}

export async function readPushSubscriptions(): Promise<StoredPushSubscription[]> {
  return readFile();
}

/** Добавить или обновить подписку (ключ — endpoint: браузер при
 *  переподписке выдаёт тот же endpoint с новыми ключами). */
export async function upsertPushSubscription(
  sub: PushSubscriptionInput,
  meta: { userAgent?: string; now?: Date } = {},
): Promise<StoredPushSubscription[]> {
  const current = await readFile();
  const existing = current.find((s) => s.endpoint === sub.endpoint);
  const record: StoredPushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    createdAt: existing?.createdAt ?? (meta.now ?? new Date()).toISOString(),
    ...(meta.userAgent ? { userAgent: meta.userAgent.slice(0, 512) } : {}),
  };
  const next = [...current.filter((s) => s.endpoint !== sub.endpoint), record];
  await writeFile(next);
  return next;
}

/** Удалить подписку по endpoint (идемпотентно). */
export async function removePushSubscription(endpoint: string): Promise<StoredPushSubscription[]> {
  const current = await readFile();
  const next = current.filter((s) => s.endpoint !== endpoint);
  if (next.length !== current.length) await writeFile(next);
  return next;
}
