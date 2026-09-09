# Push-рассылки пользователям витрины (раздел кабинета)

- **Дата:** 2026-09-09
- **Репозитории:** promo-cabinet (этот), promo-bff, abkhaz-auto (витрина — ручка
  рассылки описана как ТЗ, см. § 4: репозиторий другого владельца в этой
  сессии подключить было нельзя)

## 1. Задача

Админ в промо-кабинете создаёт пуш-рассылку (заголовок, текст, ссылка,
иконка), выбирает те же фильтры таргетинга, что у промо, сохраняет черновик
и по кнопке «Отправить пуш» рассылает FCM-уведомление пользователям
приложения. На первом этапе получатели — **все пользователи с FCM-токенами**;
таргетинг сохраняется в модели, отбор по нему — следующий этап.

## 2. Где что живёт

| Часть | Репозиторий | Что делает |
| --- | --- | --- |
| Раздел «Push-рассылки»: список, форма, кнопки | **promo-cabinet** | форма и прокси-ручки `/api/push-campaigns/*` |
| Хранение черновиков, отправка | **promo-bff** | S3 `push-campaigns.json`; `POST /push-campaigns/:id/send` зовёт витрину |
| FCM, `device_tokens`, `sendPushToUser` | **abkhaz-auto** | `POST /api/v1/push/broadcast` — рассылает по токенам |

Цепочка: кабинет → BFF (`PROMO_BFF_URL`, служебный тикет `src=promo-cabinet`)
→ витрина (`AA_BASE_URL`, тикет `src=promo-bff dst=abkhaz-auto`) → FCM.

## 3. Что сделано

### promo-cabinet

- Страницы `/cabinet/push` (список: черновики / отправленные, кнопки
  «Редактировать», «Отправить пуш», «Удалить»), `/cabinet/push/new`,
  `/cabinet/push/[id]` (черновик — форма; отправленная — read-only карточка с
  итогом рассылки). Пункт «Push-рассылки» в навигации.
- Форма `components/push-campaign-form/PushCampaignForm.tsx`: заголовок,
  текст, ссылка (путь витрины или http(s)), иконка (загрузка через
  `PromoImageUpload` или URL), **тот же `TargetingSection`, что у промо** —
  реестр фильтров читает только оси `targeting/audience/sellerStatus/
  sections/categories/schedule/lifecycle`, они и хранятся у рассылки.
  Кнопки «Сохранить черновик» и «Отправить пуш» (= сохранить + подтвердить +
  отправить).
- Схема `lib/push-campaign-schema.ts` (зеркало BFF, русские сообщения),
  нормализация `components/push-campaign-form/to-persisted.ts`. Общая с промо
  нормализация под-блоков `targeting.*` вынесена в
  `lib/targeting-normalize.ts` (поведение `toPersisted` промо не изменилось —
  покрыто прежними тестами).
- API-прокси: `GET|POST /api/push-campaigns`, `GET|DELETE
  /api/push-campaigns/[id]`, `POST /api/push-campaigns/[id]/send`. Коды BFF
  пробрасываются как есть; тело `POST` валидируется схемой до отправки в BFF.
- Новых env-переменных у кабинета нет: `PROMO_BFF_URL` и `PROMO_TICKET_*`
  уже есть. Глобальный режим Прод/Тест на рассылки не влияет (получатели —
  живые пользователи).

### promo-bff

- `services/push-campaign-schema.ts` — контракт: `id, title, body, url,
  icon?, targeting, audience?, sellerStatus?, sections?, categories?,
  schedule?, lifecycle?, status: draft|sent, createdAt, updatedAt, sentAt?,
  sendResult? { users, attempted, delivered, failed }, lastSendError?`.
- `services/push-campaign-store.ts` — S3 `push-campaigns.json`
  (`{ version: 1, campaigns: [] }`, рядом с `promos.json`).
- `services/push-broadcast-client.ts` — клиент витрины со служебным тикетом
  (`issueServiceTicket` из `@zebrooo/service-ticket`).
- `services/push-campaign-service.ts` — `save/list/get/remove/send`.
  Отправка: `sent` пишется в S3 **до** вызова витрины, при ошибке витрины —
  откат в черновик с `lastSendError`; мутации сериализованы.
- Ручки (service-ticket): `GET /push-campaigns`, `GET /push-campaigns/:id`,
  `POST /push-campaigns` (без `id` — создать, 201; с `id` — обновить, 200),
  `DELETE /push-campaigns/:id`, `POST /push-campaigns/:id/send`.
  Коды: 400 `invalid_push_campaign` (+`issues`), 404 `not_found`, 409
  `already_sent`, 503 `push_not_configured`, 502 `push_broadcast_failed`
  (+`reason`) / `push_campaigns_unavailable`.
- Env: `AA_BASE_URL`, `PROMO_TICKET_PRIVATE_KEY` (приватный ключ BFF для
  исходящих тикетов), `AA_SERVICE_NAME` (=`abkhaz-auto`),
  `AA_PUSH_BROADCAST_PATH` (=`/api/v1/push/broadcast`), `AA_PUSH_TIMEOUT_MS`
  (=60000). Кабинет должен быть в `PROMO_ALLOWED_SRC`. README BFF, раздел
  «Push-рассылки пользователям витрины».

### Как включить

1. Сгенерировать Ed25519-пару для BFF (той же утилитой, что для кабинета:
   `generateKeyPair()` из `@zebrooo/service-ticket` — base64 DER).
   Приватный ключ → `PROMO_TICKET_PRIVATE_KEY` у BFF, публичный → витрине
   (см. § 4, `PROMO_BFF_TICKET_PUBLIC_KEY`).
2. У BFF: `AA_BASE_URL=https://<витрина>`; `promo-cabinet` в
   `PROMO_ALLOWED_SRC`.
3. У кабинета ничего нового: `PROMO_BFF_URL`, `PROMO_TICKET_PRIVATE_KEY`.
4. Пока витрина не отдаёт ручку из § 4, «Отправить» отвечает 502
   `push_broadcast_failed` (черновик остаётся); без `AA_BASE_URL` — 503
   `push_not_configured`, и кабинет показывает это в списке и форме.

## 4. Что осталось на стороне витрины (abkhaz-auto) — ТЗ

**`POST /api/v1/push/broadcast`** — `src/app/api/v1/push/broadcast/route.ts`.

Авторизация — служебный тикет в заголовке `x-service-ticket`, как у
остальных межсервисных ручек: `verifyServiceTicket(ticket, { publicKey:
process.env.PROMO_BFF_TICKET_PUBLIC_KEY, expectedDst: 'abkhaz-auto',
allowedSrc: ['promo-bff'] })` (`@zebrooo/service-ticket`). Без тикета /
с плохим — `401 { error: 'unauthorized' }`. Пользовательская сессия здесь не
нужна и не принимается.

Тело запроса:

```jsonc
{
  "title": "Скидка 20% на шины",          // 1..120
  "body": "До воскресенья",                // 1..600
  "data": { "url": "/sale/tyres", "campaignId": "push-3f9a1c2b7d4e" }, // строки; url — куда ведёт пуш
  "icon": "https://…/icon.png",           // optional
  "userIds": ["uuid", "…"]                // optional; нет/пусто = всем с токенами
}
```

Логика:

1. Валидировать тело (zod). `data` — только строковые значения (требование
   FCM data-payload).
2. Получатели: `userIds`, если передан; иначе `select distinct user_id from
   device_tokens` (service-role Supabase). Пользователей без токенов
   пропускать.
3. Для каждого пользователя — существующий `sendPushToUser(userId, { title,
   body, data, icon })` из `src/lib/push/fcm.ts`; батчами (например по 50
   параллельно), ошибки одного пользователя не прерывают рассылку; невалидные
   токены (`registration-token-not-registered`) удалять из `device_tokens`,
   как уже делает `sendPushToUser`/его обвязка.
4. Ответ `200`:

```json
{ "ok": true, "users": 1234, "attempted": 1500, "delivered": 1480, "failed": 20 }
```

`users` — сколько пользователей попало в рассылку, `attempted/delivered/
failed` — по токенам (устройствам). Если FCM не сконфигурирован —
`503 { error: 'fcm_not_configured' }`; иное падение — `502 { error:
'push_failed' }`. BFF ждёт ответ до `AA_PUSH_TIMEOUT_MS` (60 с) — при
большой базе токенов рассылку стоит выполнять чанками и отвечать после
последнего, либо (следующий этап) принять задание и вернуть `202` с
итогом позже.

Env витрины: `PROMO_BFF_TICKET_PUBLIC_KEY` — публичный ключ пары из § 3
«Как включить».

## 5. Следующий этап — таргетинг

Фильтры уже лежат в кампании в том же формате, что у промо. Чтобы
рассылать по ним, BFF должен считать список `userIds` по сохранённым осям
(профиль: возраст/регион/подписка; поведение: покупки, объявления, поиск;
`sections/categories`) через свои сервисы данных (те же, что у чекеров
select-promo) и передать `userIds` в `/api/v1/push/broadcast`. Оси,
зависящие от текущего визита (гео по IP, среда, устройство, расписание
показов), для пуша смысла не имеют — их можно либо игнорировать, либо
трактовать по последнему визиту.
