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
  // persistent-promoline убрана 2026-09-10: витрина её никогда не запрашивала
  // (строку в ленте отдаёт fp/promoline/route.ts из очереди
  // `<каталог>-<устройство>`), а пикер формы предлагал её для promoline —
  // промо ложилось в очередь, которую никто не читает, без единой ошибки.
  // «Голые» каталожные очереди (home, transport, realty, goods, services, jobs,
  // news, listing) убраны 2026-09-10: шаг B' раскатки заменён на per-device
  // (d5e4520, abkhaz-auto#113 — витрина запрашивает `<каталог>-<устройство>`),
  // и с тех пор эти имена не уходят в запрос ни из одного роута. Аудит кода
  // витрины 2026-09-10: единственные отправители очереди — fp/o и fp/promoline,
  // оба шаблоном `${catalogFromPath(path)}-${device}`. Приложение
  // (abkhaz-auto-mobile) очереди по имени не запрашивает вовсе.
  //
  // Убраны только из bootstrap-а и guard-а: объекты queue-<каталог>.json в S3
  // остаются, и scripts/seed-device-queues.ts по-прежнему читает их по имени
  // через DEVICE_QUEUE_CATALOGS — путь миграции промо в per-device цел.
  // Per-device очереди (catalog×{web,touch,mobile}) — актуальный контур раскатки.
  ...DEVICE_QUEUES,
];

/**
 * Очереди, которые нельзя удалить или переименовать через queues API (409
 * prod_served_queue): удаление обслуживаемой очереди молча гасит слот витрины.
 *
 * Правило списка: рядом с КАЖДЫМ именем — роут-потребитель, который
 * запрашивает очередь по этому имени (abkhaz-auto, src/app/api/fp/*). Имя без
 * потребителя — кандидат на удаление отдельным PR (по одному контуру за раз,
 * чтобы откат был точечным), а не повод оставить «на всякий случай»:
 * мёртвая очередь в пикере формы принимает промо, которое не покажется никому.
 *
 * Проверка потребителей — 2026-09-10 по коду abkhaz-auto (grep по src/):
 */
export const PROD_SERVED_QUEUES: readonly string[] = [
  // Подтверждённые потребители (витрина запрашивает по имени):
  'persistent-topline',   // src/app/api/fp/topline/route.ts
  'persistent-inline',    // src/app/api/fp/inline/route.ts
  'tooltip',              // src/app/api/fp/tooltip/route.ts
  'cabinet-onboarding',   // src/app/api/fp/onboarding/route.ts
  // `<каталог>-<устройство>`: src/app/api/fp/o/route.ts (оверлей) и
  // src/app/api/fp/promoline/route.ts (строка в ленте) — queue:
  // `${catalogFromPath(path)}-${device}`.
  ...DEVICE_QUEUES.map((q) => q.name),

  // Потребитель НЕ НАЙДЕН — под guard-ом временно, снимается отдельным PR.
  // Аудитом кода витрины 2026-09-10 подтверждено, что эти два имени не уходят
  // в запрос: осиротели в 50271b2 (abkhaz-auto#77, «Overlay + topline no longer
  // pin home-popup/home-banner»), сегодня живут только как id слота кабинета
  // (ad-campaign.ts, колонка campaign.slot) и в поле queue не попадают.
  // Guard держится до правки promo-bff scripts/bff-smoke.mjs — смоук всё ещё
  // ждёт эти очереди, и снимать их надо тем же контуром, что и его.
  'home-banner',          // потребитель не найден; legacy pre-cutover (topline)
  'home-popup',           // потребитель не найден; legacy pre-cutover (overlay)
  // «Голые» каталожные имена сняты с guard-а 2026-09-10 вместе с bootstrap-ом
  // (см. CANONICAL_QUEUES выше): витрина запрашивает только `<каталог>-<устройство>`.
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
