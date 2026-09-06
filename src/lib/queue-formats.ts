/**
 * Human-readable queue metadata used by the cabinet.
 *
 * Queues accept promos independently of format. Storefront consumers decide
 * which surface can render a selected promo. Only fixed-format queues declare
 * `servedFormats`; the cabinet does not infer restrictions for other queues.
 */
import { DEVICE_QUEUE_CATALOGS, QUEUE_DEVICES } from './catalogue';
import type { Promo } from './schema';

export interface QueueMeta {
  name: string;
  /** Human-readable label, e.g. «Транспорт». */
  label: string;
  /** One-liner describing the section served by this queue. */
  sectionHint: string;
  /** Exact formats requested from a fixed-format queue. */
  servedFormats?: Promo['format'][];
  /** true for queues the storefront no longer requests. */
  legacy?: boolean;
}

export const QUEUE_META: Record<string, QueueMeta> = {
  home: {
    name: 'home',
    label: 'Главная',
    sectionHint: 'Главная страница',
  },
  transport: {
    name: 'transport',
    label: 'Транспорт',
    sectionHint: 'Авто, шины, диски и запчасти',
  },
  realty: {
    name: 'realty',
    label: 'Недвижимость',
    sectionHint: 'Раздел недвижимости',
  },
  goods: {
    name: 'goods',
    label: 'Товары',
    sectionHint: 'Товары и барахолка',
  },
  services: {
    name: 'services',
    label: 'Услуги',
    sectionHint: 'Раздел услуг',
  },
  jobs: {
    name: 'jobs',
    label: 'Работа',
    sectionHint: 'Раздел работы',
  },
  news: {
    name: 'news',
    label: 'Новости',
    sectionHint: 'Раздел новостей',
  },
  listing: {
    name: 'listing',
    label: 'Страница объявления',
    sectionHint: 'Карточка объявления',
  },
  tooltip: {
    name: 'tooltip',
    label: 'Тултипы',
    sectionHint: 'Контекстные подсказки у элементов страницы',
  },
  'cabinet-onboarding': {
    name: 'cabinet-onboarding',
    label: 'Онбординг кабинета',
    sectionHint: 'Онбординг рекламного кабинета',
  },
  'persistent-topline': {
    name: 'persistent-topline',
    label: 'Персистентный топлайн',
    sectionHint: 'Постоянный топлайн-слот витрины',
    servedFormats: ['topline'],
  },
  'persistent-inline': {
    name: 'persistent-inline',
    label: 'Персистентный inline',
    sectionHint: 'Постоянный inline-слот витрины',
    servedFormats: ['inline'],
  },
  'home-banner': {
    name: 'home-banner',
    label: 'Главная (лег. баннер)',
    sectionHint: 'Устаревшая очередь — заменена очередью «home»',
    legacy: true,
  },
  'home-popup': {
    name: 'home-popup',
    label: 'Главная (лег. попап)',
    sectionHint: 'Устаревшая очередь — заменена очередью «home»',
    legacy: true,
  },
};

const DEVICE_QUEUE_LABEL: Record<(typeof QUEUE_DEVICES)[number], string> = {
  web: 'веб',
  touch: 'моб. браузер',
  mobile: 'приложение',
};

for (const catalog of DEVICE_QUEUE_CATALOGS) {
  const base = QUEUE_META[catalog];
  for (const device of QUEUE_DEVICES) {
    const name = `${catalog}-${device}`;
    QUEUE_META[name] = {
      name,
      label: `${base.label} · ${DEVICE_QUEUE_LABEL[device]}`,
      sectionHint: `${base.label} — ${DEVICE_QUEUE_LABEL[device]}`,
    };
  }
}
