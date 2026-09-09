# Ось таргетинга «Рекламодатель» (`targeting.advertiser`) — Design

- **Дата:** 2026-09-09
- **Репозитории:** `promo-cabinet` (этот — сделано), `promo-bff` (AdvertiserChecker — ТЗ, § 4), `abkhaz-auto` (события мастера подачи — ТЗ, § 5)

## 1. Задача

Промо-система сегодня не видит рекламодателей: ни `ad_campaigns.status`, ни
факт «была активная РК», ни «начал мастер подачи и бросил». Поэтому нечем
таргетировать сегменты:

| № | Сегмент | Сегодня | С этой осью |
| --- | --- | --- | --- |
| 1 | Запускал РК, сейчас неактивна | нечем | `everLaunched: true` + `hasActiveCampaign: false` |
| 2 | Заходил на форму подачи РК и бросил | нечем | `abandonedWizard: true` (+ `everLaunched: false`, если нужен «так и не запустил») |
| 3 | Покупал продвижение объявлений (VIP/premium/bump) | `targeting.purchases` | без изменений — тот же фильтр «Покупки пакетов» |

Кабинет даёт форму и хранит правило в пуле; проверку делает BFF (новый
чекер `advertiser`), данные — Supabase витрины (`ad_campaigns`,
`user_action_events`).

## 2. Контракт хранения (promos.json, push-campaigns.json)

Под-блок `targeting.advertiser`, все поля опциональны; отсутствие блока =
гейта нет. Кабинет пишет только блок с хотя бы одним настоящим условием
(см. § 3.3), без ключей-`undefined`.

```jsonc
{
  "targeting": {
    "advertiser": {
      "campaignStatuses": ["active", "pending"], // слаги ad_campaigns.status, 1–10, ИЛИ внутри списка
      "hasActiveCampaign": false,                // true = есть РК в статусе active сейчас; false = ни одной
      "everLaunched": true,                      // true = хоть одна РК доходила до active; false = никогда
      "launchedWithinDays": 90,                  // только при everLaunched=true; 1–365; нет = за всё время
      "abandonedWizard": true,                   // true = form_start без form_submit_success за окно; false = нет брошенного
      "wizardLookbackDays": 30                   // только при abandonedWizard=true; 1–90; нет = дефолт BFF 30
    }
  }
}
```

Zod-схема — `advertiserTargetingSchema` в `src/lib/schema.ts` кабинета;
в BFF (`catalogue-schema.ts`, `push-campaign-schema.ts`) её нужно повторить
байт-в-байт (без русских сообщений, с `.catch`/мягкостью — как у остальных
осей). Слаги статусов: `^[a-z][a-z0-9_-]*$`, до 32 символов.

Инварианты, которые кабинет отвергает на входе (BFF может не проверять —
такие правила просто никому не покажутся):

- `hasActiveCampaign: false` + `campaignStatuses` содержит `active`;
- `everLaunched: false` + (`hasActiveCampaign: true` или `active` в статусах).

## 3. Семантика

### 3.1 Между условиями — И, внутри `campaignStatuses` — ИЛИ

Как у всех чекеров BFF. `campaignStatuses: ["paused","finished"]` +
`hasActiveCampaign: false` = «есть остановленная/завершённая и нет активной».

### 3.2 Только залогиненные (fail closed)

Кампании и мастер подачи привязаны к аккаунту. Гостю промо с этим блоком не
показывается; кабинет не даёт сохранить `audience: 'anonymous'` вместе с
блоком (superRefine в `promoSchema` + `validatePromoForm` /
`validatePushCampaignForm`). Если данные по рекламодателю недоступны (RPC
упал, витрина не настроена) — чекер тоже отвечает «нет» (как
LifecycleChecker), а не пропускает.

### 3.3 Что считается условием

`campaignStatuses` (непустой), `hasActiveCampaign`, `everLaunched`,
`abandonedWizard`. `launchedWithinDays` и `wizardLookbackDays` — только
модификаторы: без своего условия (`=== true`) кабинет их вычищает
(`lib/targeting-normalize.ts`), пустой блок в пул не пишется.

## 4. promo-bff — ТЗ на AdvertiserChecker

### 4.1 Данные

Один RPC витрины (Supabase, service-role), чтобы не делать по 3 запроса на
показ, например `promo_viewer_advertiser(p_user_id uuid, p_wizard_lookback_days int)`:

```jsonc
{
  "statuses": ["paused", "pending"],      // distinct ad_campaigns.status у advertiser_id = user
  "has_active": false,                    // exists status = 'active'
  "last_launched_at": "2026-07-01T…Z",    // max по запускавшимся РК; null = никогда
  "wizard_started_at": "2026-09-01T…Z",   // последний form_start (form_id = 'ad_campaign') за окно; null = не было
  "wizard_submitted_at": null             // последний form_submit_success (тот же form_id) за окно
}
```

- **«Запускалась»** — РК со `status = 'active'` сейчас **или** со статусом из
  множества «после запуска» (`paused`, `finished`/`completed`, `archived`
  после активности — уточнить по реальному enum витрины и вынести в
  константу BFF `LAUNCHED_STATUSES`), **или** с ненулевой датой запуска
  (`starts_at`/`activated_at`, если витрина её пишет). `pending`/`draft`/
  `rejected` без запуска — не запускалась.
- `last_launched_at` — максимум из даты запуска (или `updated_at` как
  fallback) по запускавшимся РК.
- Мастер — по `user_action_events` (`form_start` / `form_submit_success` с
  `form_id = 'ad_campaign'`, см. § 5) за `p_wizard_lookback_days` дней.

Результат кэшировать в рамках запроса выбора промо (как остальные
per-viewer данные), чтобы очередь из N кандидатов дёргала RPC один раз.

### 4.2 Правила чекера (`name: 'advertiser'`, участвует в `skipCheckers`)

```
rule = promo.targeting.advertiser; if !rule → pass
if !user.authenticated || !user.id → fail
data = viewerAdvertiser(user.id, rule.wizardLookbackDays ?? 30); if error → fail

if rule.campaignStatuses?.length && !rule.campaignStatuses.some(s => data.statuses.includes(s)) → fail
if rule.hasActiveCampaign !== undefined && rule.hasActiveCampaign !== data.has_active → fail
if rule.everLaunched !== undefined:
    launched = data.last_launched_at !== null
    if rule.everLaunched !== launched → fail
    if rule.everLaunched && rule.launchedWithinDays !== undefined
       && now - data.last_launched_at > launchedWithinDays days → fail
if rule.abandonedWizard !== undefined:
    abandoned = data.wizard_started_at !== null
      && (data.wizard_submitted_at === null || data.wizard_submitted_at < data.wizard_started_at)
    if rule.abandonedWizard !== abandoned → fail
pass
```

«Бросил» = последний старт мастера в окне не закрыт успешной отправкой
после него. Отправил, потом снова открыл и ушёл — тоже «бросил» (последний
старт без отправки).

### 4.3 Пуш-рассылки

`push-campaign-schema.ts` BFF наследует `targeting` от каталожной схемы —
блок должен пройти валидацию и сохраниться; применять его к выборке
адресатов — по общему плану таргетинга пушей (сейчас BFF шлёт всем).

## 5. abkhaz-auto — ТЗ на события мастера подачи

`CampaignEditor.tsx` (`src/app/lk/reklama/`) должен слать общие form-события
из таксономии (`docs/event-taxonomy.md`) с фиксированным `form_id`:

- `form_start { form_id: 'ad_campaign' }` — при первом взаимодействии с
  формой создания РК (открытие `/lk/reklama/new` + первый ввод; редактирование
  существующей РК — тот же `form_id`, отдельно не различаем);
- `form_submit_success { form_id: 'ad_campaign' }` — после успешного
  создания строки в `ad_campaigns`;
- `form_abandon { form_id: 'ad_campaign' }` — по желанию, для аналитики;
  чекер на него не опирается (уход с вкладки не всегда даёт событие).

Пока витрина событий не шлёт, `abandonedWizard` никогда не совпадёт
(сегмент № 2 пуст) — остальные условия оси работают независимо.

Опциональный fallback без событий: считать «бросил» по строкам
`ad_campaigns` со статусом черновика (`draft`), если витрина их создаёт при
входе в мастер, — решать при реализации в BFF.

## 6. promo-cabinet — что сделано

- `src/lib/schema.ts`: `adCampaignStatusSchema`, `advertiserTargetingSchema`,
  `targeting.advertiser` в `servingBlockSchema`, правило «гость ×
  рекламодатель» в `promoSchema.superRefine` (`ADVERTISER_ANONYMOUS_MESSAGE`).
  Пуш-рассылки получают ось автоматически (`pushTargetingShape` берёт
  `targeting` из `servingBlockSchema`).
- `src/lib/targeting-normalize.ts`: `hasAdvertiserCriteria`, вычистка пустого
  блока и «сиротских» модификаторов (общая для промо и пушей).
- `validate.ts` обеих форм: дубль правила «гость × рекламодатель» (member-
  схемы `SCHEMA_BY_FORMAT` superRefine не знают), пустой блок не краснит.
- Реестр фильтров: группа **«Рекламодатель»**, фильтр «Рекламные кампании»
  (`targeting.advertiser`) со сводкой; редактор — три трёхпозиционных
  условия (не важно / да / нет) + периоды при «да» + список статусов.
- `docs/promo-format-schemas.md` перегенерирован (`pnpm docs:formats`).
