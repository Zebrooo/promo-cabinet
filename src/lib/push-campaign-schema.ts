/**
 * Пуш-кампании (раздел «Push-рассылки»). Кабинет — только форма и список:
 * хранение в S3 и отправка живут в promo-bff (/push-campaigns/*), рассылку
 * делает витрина abkhaz-auto (FCM, device_tokens). Схема зеркалит
 * promo-bff/src/services/push-campaign-schema.ts, плюс русские сообщения
 * для формы.
 *
 * Таргетинг — те же оси, что у промо (targeting/audience/sellerStatus/
 * sections/categories/schedule/lifecycle), и те же zod-подсхемы из
 * schema.ts, чтобы форма переиспользовала TargetingSection как есть. На
 * первом этапе таргетинг только сохраняется: BFF рассылает всем
 * пользователям с FCM-токенами.
 */
import { z } from 'zod';
import { audienceSchema, isHttpUrl, isSafeHref, scheduleSchema, servingBlockSchema } from './schema';

/** Относительный путь витрины (/listing/123) или http(s)-URL. */
const URL_SHAPE = /^(\/(?!\/)|https?:\/\/)/i;

export const pushCampaignStatusSchema = z.enum(['draft', 'sent']);
export type PushCampaignStatus = z.infer<typeof pushCampaignStatusSchema>;

export const PUSH_TITLE_MAX = 120;
export const PUSH_BODY_MAX = 600;

/** Общие с промо оси таргетинга — ровно те же подсхемы, что у servingBlockSchema. */
export const pushTargetingShape = {
  targeting: servingBlockSchema.shape.targeting,
  audience: audienceSchema.optional(),
  sellerStatus: servingBlockSchema.shape.sellerStatus,
  sections: servingBlockSchema.shape.sections,
  categories: servingBlockSchema.shape.categories,
  schedule: scheduleSchema.optional(),
  lifecycle: servingBlockSchema.shape.lifecycle,
};

/** Что уходит в POST /api/push-campaigns (и дальше в BFF). id — только при
 *  обновлении существующего черновика. */
export const pushCampaignInputSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/i, 'Некорректный id').optional(),
  title: z.string().trim().min(1, 'Укажите заголовок').max(PUSH_TITLE_MAX, `Заголовок — не длиннее ${PUSH_TITLE_MAX} символов`),
  body: z.string().trim().min(1, 'Укажите текст').max(PUSH_BODY_MAX, `Текст — не длиннее ${PUSH_BODY_MAX} символов`),
  url: z.string().trim().min(1, 'Укажите ссылку').max(1024, 'Ссылка — не длиннее 1024 символов')
    .refine(isSafeHref, 'Ссылка с такой схемой запрещена')
    .refine((v) => URL_SHAPE.test(v), 'Путь витрины (/listing/123) или http(s)-ссылка'),
  icon: z.string().trim().url('Некорректный URL иконки').max(1024).refine(isHttpUrl, 'Допустимы только http(s)-ссылки').optional(),
  ...pushTargetingShape,
});
export type PushCampaignInput = z.infer<typeof pushCampaignInputSchema>;

export const pushSendResultSchema = z.object({
  users: z.number().int().nonnegative(),
  attempted: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type PushSendResult = z.infer<typeof pushSendResultSchema>;

/** Кампания, как её отдаёт BFF. */
export const pushCampaignSchema = pushCampaignInputSchema.extend({
  id: z.string().min(1).max(64),
  status: pushCampaignStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  sentAt: z.string().optional(),
  sendResult: pushSendResultSchema.optional(),
  lastSendError: z.string().optional(),
});
export type PushCampaign = z.infer<typeof pushCampaignSchema>;

/** Состояние формы: те же поля, что у входа, но все текстовые — строки
 *  (Formik не любит undefined в контролируемых инпутах), icon может быть ''. */
export type PushCampaignFormValues = {
  id?: string;
  title: string;
  body: string;
  url: string;
  icon: string;
  targeting: PushCampaignInput['targeting'];
  audience?: PushCampaignInput['audience'];
  sellerStatus?: PushCampaignInput['sellerStatus'];
  sections?: string[];
  categories?: string[];
  schedule?: PushCampaignInput['schedule'];
  lifecycle?: PushCampaignInput['lifecycle'];
};

export function emptyPushCampaignForm(): PushCampaignFormValues {
  return { title: '', body: '', url: '', icon: '', targeting: {}, audience: 'all' };
}

/** Сохранённая кампания → значения формы. */
export function toPushCampaignForm(c: PushCampaign): PushCampaignFormValues {
  return {
    id: c.id,
    title: c.title,
    body: c.body,
    url: c.url,
    icon: c.icon ?? '',
    targeting: c.targeting,
    audience: c.audience ?? 'all',
    sellerStatus: c.sellerStatus,
    sections: c.sections,
    categories: c.categories,
    schedule: c.schedule,
    lifecycle: c.lifecycle,
  };
}
