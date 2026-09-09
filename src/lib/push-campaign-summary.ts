// Сводка таргетинга пуш-кампании для карточки списка и read-only страницы.
// Реестр фильтров таргетинга (promo-form/targeting/registry.ts) читает
// только оси targeting/audience/sellerStatus/sections/categories/schedule/
// lifecycle — ровно те, что хранит пуш-кампания, поэтому переиспользуем его,
// подавая кампанию как Promo-подобный объект.
import type { Promo } from './schema';
import { FILTERS } from '@/components/promo-form/targeting/registry';
import type { PushCampaign, PushSendResult } from './push-campaign-schema';

export function pushTargetingSummary(c: Pick<PushCampaign, 'targeting' | 'audience' | 'sellerStatus' | 'sections' | 'categories' | 'schedule' | 'lifecycle'>): string[] {
  const asPromo = c as unknown as Promo;
  return FILTERS.filter((f) => f.isActive(asPromo)).map((f) => {
    const s = f.summary(asPromo);
    return s ? `${f.label}: ${s}` : f.label;
  });
}

export const PUSH_STATUS_LABEL: Record<PushCampaign['status'], string> = {
  draft: 'ЧЕРНОВИК',
  sent: 'ОТПРАВЛЕНО',
};

export function formatPushWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatSendResult(r: PushSendResult | undefined): string {
  if (!r) return 'итог рассылки не получен';
  return `${r.users} польз. · доставлено ${r.delivered} из ${r.attempted}${r.failed ? ` · ошибок ${r.failed}` : ''}`;
}

/** Ошибки BFF/кабинета → текст для админа. */
export const PUSH_ERROR_MESSAGES: Record<string, string> = {
  invalid_push_campaign: 'Проверьте поля: заголовок, текст и ссылка обязательны.',
  not_found: 'Рассылка не найдена — возможно, её уже удалили.',
  already_sent: 'Эта рассылка уже отправлена: её нельзя изменить или отправить повторно.',
  push_not_configured: 'У BFF не настроена отправка (AA_BASE_URL / PROMO_TICKET_PRIVATE_KEY) — черновик сохранён, но разослать пока нельзя.',
  push_broadcast_failed: 'Витрина не приняла рассылку. Черновик сохранён — попробуйте ещё раз.',
  push_campaigns_unavailable: 'Хранилище рассылок (S3 за BFF) недоступно. Попробуйте ещё раз.',
  bff_unreachable: 'BFF недоступен — попробуйте позже.',
  unauthorized: 'Сессия истекла. Войдите снова.',
};

export function describePushError(status: number, body: { error?: string; reason?: string } | undefined): string {
  const key = body?.error ?? '';
  const base = PUSH_ERROR_MESSAGES[key] ?? (key ? `Ошибка: ${key}` : `Ошибка ${status}`);
  return body?.reason && key === 'push_broadcast_failed' ? `${base} (${body.reason})` : base;
}
