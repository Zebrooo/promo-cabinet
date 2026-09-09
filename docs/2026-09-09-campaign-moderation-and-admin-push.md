# Модерация рекламных кампаний + пуши админам + «нулевые» кампании

- **Дата:** 2026-09-09
- **Репозитории:** promo-cabinet (этот), promo-bff, abkhaz-auto (витрина — часть ещё не сделана, см. § 4)

## 1. Задача

1. Когда рекламодатель создаёт новую рекламную кампанию, админам должны
   приходить пуши, и кампания должна ждать их подтверждения.
2. При создании кампании с нулевым балансом человеку сразу предлагается
   пополнить баланс — «нулевых» кампаний быть не должно.

## 2. Где что живёт

| Часть | Репозиторий | Что делает |
| --- | --- | --- |
| Создание кампании, кошелёк, редактор | **abkhaz-auto** (`src/app/lk/reklama/CampaignEditor.tsx`) | пишет строку в `ad_campaigns` своей Supabase |
| Аукцион, чтение `ad_campaigns` | **promo-bff** | отдаёт витрине победителя по CPM |
| Админка промо | **promo-cabinet** | S3-пул промо; теперь ещё и пульт модерации |

Кабинет и BFF не создают кампании и не видят кошелёк напрямую — поэтому
гейт «подтверди перед показом» сделан на стороне BFF (единственная точка,
через которую кампания вообще попадает на витрину), а пульт — в кабинете.

## 3. Что сделано

### promo-bff

- `services/campaign-review-service.ts` — чтение `ad_campaigns` целиком
  (`select=*`, защитный маппинг) и `PATCH status`.
- `services/campaign-moderation-store.ts` — состояние модерации в S3
  (`campaign-moderation.json`, рядом с `promos.json`): `pending | approved |
  rejected`, кто/когда/почему, `notifiedAt`.
- `services/campaign-moderation.ts` — поллер новых кампаний (60 с), bootstrap
  (всё существующее на момент включения — approved), уведомление админов,
  `decide()`, `filterApproved()` для аукциона (fail-open, пока состояние не
  прочитано).
- `services/web-push.ts` — Web Push на `node:crypto` (VAPID ES256 +
  aes128gcm), без внешних зависимостей.
- `services/admin-notifier.ts` — каналы Web Push (подписки из S3) и Telegram.
- `server.ts` — `/auction` и `/feed-fill` видят только approved-кампании;
  ручки `POST /campaign-moderation/list` и `POST /campaign-moderation/decide`;
  поллер стартует только у реального процесса (`startCampaignModerationPoller`).
- Env: `CAMPAIGN_MODERATION_POLL_MS`, `PROMO_CABINET_URL`,
  `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`,
  `ADMIN_TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_CHAT_IDS` (README BFF).

### promo-cabinet

- Раздел **«Кампании»** (`/cabinet/campaigns`): очередь на подтверждение с
  карточкой кампании (CPM, бюджеты, страницы, креатив, **баланс
  рекламодателя** и предупреждение при нуле), кнопки «Подтвердить /
  Отклонить (с причиной)», история решений. Счётчик ожидающих у пункта меню.
- Кнопка **«Включить уведомления»** — Web Push в браузере админа:
  `public/sw.js` + `/api/push/subscription` (подписки в S3
  `push-subscriptions.json`, читает BFF).
- API: `GET /api/campaigns`, `POST /api/campaigns/decide`, `POST|DELETE
  /api/push/subscription`.
- Env: `WEB_PUSH_VAPID_PUBLIC_KEY` (публичный ключ той же пары, что у BFF).
- Dockerfile теперь копирует `public/` (там service worker).

### Как включить

1. `npx web-push generate-vapid-keys` → публичный ключ в `.env` кабинета и
   BFF, приватный — только BFF. `WEB_PUSH_SUBJECT=mailto:…`.
2. (опционально) Telegram: `ADMIN_TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_CHAT_IDS`.
3. `PROMO_CABINET_URL=https://<кабинет>` у BFF — ссылка в уведомлении.
4. Каждый админ на каждом своём браузере нажимает «Включить уведомления» на
   странице «Кампании» (кабинет должен быть на HTTPS; iPhone — только из
   PWA «на экран Домой»).
5. Первый запуск BFF с новым кодом делает bootstrap: текущие кампании
   одобрены автоматически, дальше каждая новая — через подтверждение.

## 4. Что осталось на стороне витрины (abkhaz-auto) — не сделано

В этой сессии репозиторий `djonua/abkhaz-auto` подключить было нельзя
(другой владелец), поэтому две вещи, которые живут только там, описаны как ТЗ:

1. **Нулевой баланс при создании кампании.** В `CampaignEditor.tsx`
   (`enoughForLaunch`, шаг «Сколько платить» / кнопка «Отправить»): если
   баланс кошелька (`ledger_accounts`, kind=liability) ≤ 0 — блокировать
   отправку и показывать модалку/баннер «Пополните баланс, чтобы запустить
   кампанию» с переходом в кошелёк (`lk/reklama`, якорь `reklama-wallet`).
   Ту же проверку продублировать на сервере (server action / API создания
   кампании) — клиентский гейт обходится. Сейчас BFF просто не откручивает
   кампанию неплатёжеспособного рекламодателя, а в кабинете такая кампания
   помечена «баланс 0 ₽» — но самому человеку витрина об этом не говорит.
2. **Статус «на модерации» для рекламодателя.** Сегодня витрина создаёт
   кампанию сразу `active`, а BFF придерживает её в S3-состоянии `pending`;
   в ЛК рекламодатель видит «активна», хотя показов нет. Лучше: создавать со
   статусом `pending` (BFF уже понимает его — approve переводит в `active`,
   reject ставит `paused`) и показывать в ЛК «на модерации» / «отклонена».
   Если у `ad_campaigns.status` есть CHECK — добавить `pending` в миграции.

Контракт с BFF при этом не меняется: он уже опрашивает статусы `active` и
`pending`.
