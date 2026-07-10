/**
 * Queue → formats/section dictionary.
 *
 * Ground-truth: what abkhaz-auto actually requests from each queue right now
 * (verified against storefront slot wiring, July 2026):
 *   - Catalog queues (home, transport, realty, goods, services, jobs, news, listing):
 *     two slots per page — topline (formats:['topline']) and overlay
 *     (formats:['popup','fullscreen','inline','divkit']). `multistep` and `custom`
 *     are NOT requested from these queues.
 *   - tooltip: only formats:['tooltip'].
 *   - cabinet-onboarding: formats: custom, multistep, tooltip, popup.
 *   - home-banner / home-popup: legacy — storefront no longer requests them
 *     (replaced by the per-catalog cutover). Marked legacy=true.
 */
import type { Promo } from './schema';

export type PromoFormat = Promo['format'];

export interface QueueMeta {
  name: string;
  /** Human-readable label, e.g. «Транспорт» */
  label: string;
  /** One-liner describing what section this queue serves and which formats */
  sectionHint: string;
  /** Formats the storefront actually requests from this queue */
  servedFormats: PromoFormat[];
  /** true for queues the storefront no longer requests */
  legacy?: boolean;
}

/** Catalog queues share the same slot wiring: topline + overlay (popup/fullscreen/inline/divkit). */
const CATALOG_FORMATS: PromoFormat[] = ['topline', 'popup', 'fullscreen', 'inline', 'divkit'];

export const QUEUE_META: Record<string, QueueMeta> = {
  home: {
    name: 'home',
    label: 'Главная',
    sectionHint: 'Главная страница — топлайн и оверлеи каталога',
    servedFormats: CATALOG_FORMATS,
  },
  transport: {
    name: 'transport',
    label: 'Транспорт',
    sectionHint: 'Авто, шины, диски, запчасти — топлайн и оверлеи каталога',
    servedFormats: CATALOG_FORMATS,
  },
  realty: {
    name: 'realty',
    label: 'Недвижимость',
    sectionHint: 'Недвижимость — топлайн и оверлеи каталога',
    servedFormats: CATALOG_FORMATS,
  },
  goods: {
    name: 'goods',
    label: 'Товары',
    sectionHint: 'Товары и барахолка — топлайн и оверлеи каталога',
    servedFormats: CATALOG_FORMATS,
  },
  services: {
    name: 'services',
    label: 'Услуги',
    sectionHint: 'Услуги — топлайн и оверлеи каталога',
    servedFormats: CATALOG_FORMATS,
  },
  jobs: {
    name: 'jobs',
    label: 'Работа',
    sectionHint: 'Работа — топлайн и оверлеи каталога',
    servedFormats: CATALOG_FORMATS,
  },
  news: {
    name: 'news',
    label: 'Новости',
    sectionHint: 'Новости — топлайн и оверлеи каталога',
    servedFormats: CATALOG_FORMATS,
  },
  listing: {
    name: 'listing',
    label: 'Страница объявления',
    sectionHint: 'Страница объявления — топлайн и оверлеи каталога',
    servedFormats: CATALOG_FORMATS,
  },
  tooltip: {
    name: 'tooltip',
    label: 'Тултипы',
    sectionHint: 'Привязанные подсказки у элементов страницы',
    servedFormats: ['tooltip'],
  },
  'cabinet-onboarding': {
    name: 'cabinet-onboarding',
    label: 'Онбординг кабинета',
    sectionHint: 'Тур по рекламному кабинету (custom, multistep, tooltip, popup)',
    servedFormats: ['custom', 'multistep', 'tooltip', 'popup'],
  },
  // Legacy queues — storefront no longer requests these
  'home-banner': {
    name: 'home-banner',
    label: 'Главная (лег. баннер)',
    sectionHint: 'Устаревшая очередь топлайна — заменена очередью «home»',
    servedFormats: ['topline'],
    legacy: true,
  },
  'home-popup': {
    name: 'home-popup',
    label: 'Главная (лег. попап)',
    sectionHint: 'Устаревшая очередь попапа — заменена очередью «home»',
    servedFormats: ['popup', 'fullscreen', 'inline', 'divkit'],
    legacy: true,
  },
};

/**
 * Returns the list of formats the storefront actually requests from the given
 * queue, or null if the queue is not in our dictionary (custom/unknown queue —
 * we don't show any hint in that case).
 */
export function formatsServedBy(queue: string): PromoFormat[] | null {
  return QUEUE_META[queue]?.servedFormats ?? null;
}

/**
 * Returns the names of queues that serve the given format, excluding legacy
 * queues. Useful for hints like «Формат обслуживается очередями: …».
 */
export function queuesServing(format: PromoFormat): string[] {
  return Object.values(QUEUE_META)
    .filter((m) => !m.legacy && m.servedFormats.includes(format))
    .map((m) => m.name);
}

/**
 * Returns true when a promo with the given format would NOT be picked up by
 * any slot in the given queue (i.e. the queue exists in our dictionary but
 * the format is not in servedFormats). Returns false for unknown queues (we
 * prefer no false positives over no false negatives for custom queues).
 */
export function isFormatMismatch(queue: string, format: PromoFormat): boolean {
  const served = formatsServedBy(queue);
  if (served === null) return false; // unknown queue → no warning
  return !served.includes(format);
}
