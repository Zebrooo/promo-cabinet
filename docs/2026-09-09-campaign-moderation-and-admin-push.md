# Пуши админам о новых рекламных кампаниях + «нулевые» кампании

- **Дата:** 2026-09-09
- **Репозитории:** promo-cabinet (этот), promo-bff, abkhaz-auto (витрина — часть ещё не сделана, см. § 4)

## 1. Задача

1. Когда рекламодатель создаёт новую рекламную кампанию, админам должны
   приходить пуши.
2. При создании кампании с нулевым балансом человеку сразу предлагается
   пополнить баланс — «нулевых» кампаний быть не должно.

## 2. Где что живёт

| Часть | Репозиторий | Что делает |
| --- | --- | --- |
| Создание кампании, кошелёк, редактор | **abkhaz-auto** (`src/app/lk/reklama/CampaignEditor.tsx`) | пишет строку в `ad_campaigns` своей Supabase |
| Аукцион, чтение `ad_campaigns` | **promo-bff** | отдаёт витрине победителя по CPM |
| Админка промо | **promo-cabinet** | S3-пул промо; теперь ещё и подписка на пуши |

Кабинет и BFF не создают кампании — поэтому «новая кампания» ловится
поллером в BFF (у него есть service-role доступ к `ad_campaigns`), а
подписка на пуши живёт в кабинете, которым пользуются админы.

## 3. Что сделано

### promo-bff

- `services/campaign-review-service.ts` — чтение `ad_campaigns` целиком
  (`select=*`, защитный маппинг).
- `services/new-campaign-watcher.ts` — поллер (60 с): каждая ещё не виденная
  кампания со статусом `active`/`pending` → уведомление админам; «уже
  видели» — в S3 (`seen-campaigns.json`, рядом с `promos.json`); первый
  запуск — bootstrap без уведомлений. На аукцион не влияет.
- `services/web-push.ts` — Web Push на `node:crypto` (VAPID ES256 +
  aes128gcm), без внешних зависимостей.
- `services/admin-notifier.ts` — каналы Web Push (подписки из S3) и Telegram.
- `server.ts` — `POST /new-campaigns/recent` (последние новые кампании для
  страницы кабинета); поллер стартует только у реального процесса.
- Env: `NEW_CAMPAIGN_POLL_MS`, `PROMO_CABINET_URL`,
  `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`,
  `ADMIN_TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_CHAT_IDS` (README BFF).

### promo-cabinet

- Раздел **«Кампании»** (`/cabinet/campaigns`): кнопка **«Включить
  уведомления»** (Web Push в браузере админа: `public/sw.js` +
  `/api/push/subscription`, подписки в S3 `push-subscriptions.json`, читает
  BFF) и список последних новых кампаний, о которых уходили пуши.
- API: `GET /api/campaigns`, `POST|DELETE /api/push/subscription`.
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
   помечаются виденными, дальше о каждой новой уходит пуш.

## 4. Что осталось на стороне витрины (abkhaz-auto) — не сделано

В этой сессии репозиторий `djonua/abkhaz-auto` подключить было нельзя
(другой владелец), поэтому пункт про нулевой баланс описан как ТЗ:

**Нулевой баланс при создании кампании.** В `CampaignEditor.tsx`
(`enoughForLaunch`, шаг «Сколько платить» / кнопка «Отправить»): если баланс
кошелька (`ledger_accounts`, kind=liability) ≤ 0 — блокировать отправку и
показывать модалку/баннер «Пополните баланс, чтобы запустить кампанию» с
переходом в кошелёк (`lk/reklama`, якорь `reklama-wallet`). Ту же проверку
продублировать на сервере (server action / API создания кампании) —
клиентский гейт обходится. Сейчас BFF просто не откручивает кампанию
неплатёжеспособного рекламодателя, но самому человеку витрина об этом не
говорит.
