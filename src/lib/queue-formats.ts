/**
 * Human-readable queue metadata used by the cabinet.
 *
 * Most queues accept promos independently of format. Fixed-format queues
 * declare `servedFormats`; the cabinet uses that contract in both the picker
 * and enqueue API, without inferring restrictions for other queues.
 */
import { DEVICE_QUEUE_CATALOGS, QUEUE_DEVICES } from './catalogue-consts';
import type { Promo } from './schema';

export interface QueueMeta {
  name: string;
  /** Human-readable label, e.g. «Транспорт». */
  label: string;
  /** One-liner describing the section served by this queue. */
  sectionHint: string;
  /** Exact formats requested from a fixed-format queue. */
  servedFormats?: Promo['format'][];
  /**
   * true = ни один потребитель не запрашивает очередь по этому имени, значит
   * промо в ней не покажется никому. Кабинет помечает такие очереди в пикере
   * и зажигает предупреждение `legacyOnly` на промо, которое стоит ТОЛЬКО в
   * них (см. lib/promo-filters.ts). Список потребителей — комментарии у
   * PROD_SERVED_QUEUES в catalogue-consts.ts.
   */
  legacy?: boolean;
}

/** Подсказка для голых каталожных очередей: витрина ходит только в
 *  `<каталог>-<устройство>` (fp/o/route.ts, fp/promoline/route.ts), поэтому
 *  сама `transport` и её собратья ничего не показывают. */
const catalogHint = (label: string) =>
  `Витрина эту очередь не запрашивает — она ходит в «${label} · веб / моб. браузер / приложение». Промо здесь не покажется`;

export const QUEUE_META: Record<string, QueueMeta> = {
  home: {
    name: 'home',
    label: 'Главная',
    sectionHint: catalogHint('Главная'),
    legacy: true,
  },
  transport: {
    name: 'transport',
    label: 'Транспорт',
    sectionHint: catalogHint('Транспорт'),
    legacy: true,
  },
  realty: {
    name: 'realty',
    label: 'Недвижимость',
    sectionHint: catalogHint('Недвижимость'),
    legacy: true,
  },
  goods: {
    name: 'goods',
    label: 'Товары',
    sectionHint: catalogHint('Товары'),
    legacy: true,
  },
  services: {
    name: 'services',
    label: 'Услуги',
    sectionHint: catalogHint('Услуги'),
    legacy: true,
  },
  jobs: {
    name: 'jobs',
    label: 'Работа',
    sectionHint: catalogHint('Работа'),
    legacy: true,
  },
  news: {
    name: 'news',
    label: 'Новости',
    sectionHint: catalogHint('Новости'),
    legacy: true,
  },
  listing: {
    name: 'listing',
    label: 'Страница объявления',
    sectionHint: catalogHint('Страница объявления'),
    legacy: true,
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

/** Fixed-format queues accept only the formats declared by their consumer. */
export function queueAllowsFormat(queueName: string, format: Promo['format']): boolean {
  const servedFormats = QUEUE_META[queueName]?.servedFormats;
  return servedFormats === undefined || servedFormats.includes(format);
}

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
