/**
 * Константы каталога без серверных импортов: имена очередей, что запрашивает
 * витрина, якоря тултипов. Живут отдельно от catalogue.ts (S3-клиент,
 * node:async_hooks), потому что их читают и клиентские компоненты формы.
 */
export const DEVICE_QUEUE_CATALOGS = [
  'home', 'transport', 'realty', 'goods', 'services', 'jobs', 'news', 'listing',
] as const;
export const QUEUE_DEVICES = ['web', 'touch', 'mobile'] as const;
export const DEVICE_QUEUES: { name: string; persist: boolean }[] =
  DEVICE_QUEUE_CATALOGS.flatMap((c) => QUEUE_DEVICES.map((d) => ({ name: `${c}-${d}`, persist: false })));

export const CANONICAL_QUEUES: { name: string; persist: boolean }[] = [
  // Legacy pre-cutover queues. Kept until the storefront stops requesting
  // them (retire = separate step D after the per-catalog cutover).
  { name: 'home-banner', persist: true  }, // abkhaz-auto topline (cookie-pinned banner)
  { name: 'home-popup',  persist: false }, // abkhaz-auto popup (rotates per visit)
  { name: 'tooltip',     persist: false }, // abkhaz-auto tooltip (anchored bubble; site requests this queue)
  { name: 'cabinet-onboarding', persist: false }, // ad-cabinet onboarding tooltips (editor lead-by-hand)
  { name: 'persistent-topline', persist: true },
  { name: 'persistent-inline',  persist: true },
  { name: 'persistent-promoline', persist: true },
  // Per-catalog queues (step B' of the per-catalog rollout): one queue per
  // storefront catalog page context; the BFF picks by format inside the queue.
  { name: 'home',      persist: false },
  { name: 'transport', persist: false },
  { name: 'realty',    persist: false },
  { name: 'goods',     persist: false },
  { name: 'services',  persist: false },
  { name: 'jobs',      persist: false },
  { name: 'news',      persist: false },
  { name: 'listing',   persist: false },
  // Per-device очереди (catalog×{web,touch,mobile}) — актуальный контур раскатки.
  // Старые catalog-очереди выше остаются до retire-шага (Фаза 4).
  ...DEVICE_QUEUES,
];

/**
 * Queue names production consumers request from the BFF RIGHT NOW (storefront
 * slot wiring + ad-cabinet onboarding). Deleting or renaming one of these
 * silently darks a live slot, so the queues API refuses with 409 until the
 * consumer stops requesting the name.
 *
 * After the per-catalog cutover (step C) add the 8 catalog queues here; the
 * legacy names move out only at the retire step D.
 */
export const PROD_SERVED_QUEUES: readonly string[] = [
  'home-banner',
  'home-popup',
  'tooltip',
  'cabinet-onboarding',
  'persistent-topline',
  'persistent-inline',
  'persistent-promoline',
  // Per-catalog queues — the storefront now requests one per page/catalog
  // (step C cutover, feat/per-catalog-promo-queues): overlay+topline derive the
  // queue from catalogFromPath(). Guarded so they can't be deleted while served.
  'home', 'transport', 'realty', 'goods', 'services', 'jobs', 'news', 'listing',
  // Per-device очереди — сторфронт запрашивает их после Фазы 3. Guard от удаления.
  ...DEVICE_QUEUES.map((q) => q.name),
  // Legacy home-banner/home-popup stay until the retire step D.
];

/**
 * Named tooltip anchors the storefront sites mark with data-promo-anchor="<id>".
 * Page-scoped: `pages` lists the page contexts where the anchor element exists,
 * so the BFF only serves a tooltip where its anchor is present (mirrors the
 * AD_PAGES/page-targeting model). The advertiser picks an id from this list in
 * the cabinet. Keep in sync with the consumer's data-promo-anchor markup.
 */
export const CANONICAL_ANCHORS: { id: string; label: string; pages: string[] }[] = [
  { id: 'home-search',     label: 'Поиск на главной',       pages: ['home'] },
  { id: 'listing-cta',     label: 'Кнопка на карточке',     pages: ['listing'] },
  { id: 'catalog-filters', label: 'Фильтры каталога',       pages: ['catalog'] },
  { id: 'campaign-editor-where',  label: 'Кабинет · шаг «Где показывать»',  pages: ['campaign-editor'] },
  { id: 'campaign-editor-what',   label: 'Кабинет · шаг «Что на баннере»',  pages: ['campaign-editor'] },
  { id: 'campaign-editor-budget', label: 'Кабинет · шаг «Сколько платить»', pages: ['campaign-editor'] },
  { id: 'campaign-editor-submit', label: 'Кабинет · кнопка «Отправить»',    pages: ['campaign-editor'] },
  // Site anchors mirrored from the storefront's data-promo-anchor markup
  // (duplicated from data-onboarding-anchor, feat/promo-anchor-coverage).
  { id: 'categories-sidebar', label: 'Сайдбар категорий',              pages: ['home'] },
  { id: 'listing-price',      label: 'Цена объявления',                pages: ['listing'] },
  { id: 'listing-seller',     label: 'Блок продавца',                  pages: ['listing'] },
  { id: 'lk-sidebar',         label: 'Меню личного кабинета',          pages: ['lk'] },
  { id: 'lk-hero-kpi',        label: 'KPI-плитка в шапке ЛК',          pages: ['lk'] },
  { id: 'boost-btn',          label: 'Кнопка «Продвинуть» на карточке', pages: ['lk-obyavleniya'] },
  { id: 'reklama-wallet',     label: 'Кошелёк рекламы',                pages: ['lk-reklama'] },
  { id: 'reklama-methods',    label: 'Способы продвижения',            pages: ['lk-reklama'] },
  { id: 'reklama-banner',     label: 'Карточка «Купить баннер»',        pages: ['lk-reklama'] },
];
