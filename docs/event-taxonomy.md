# Event taxonomy (user_action_events)

All events: snake_case name, flat props with primitive values, ≤2KB.
Auto-enriched: `referrer_source` (web client), `auth_state` (web /api/track), `session_id`, `user_id` (server-resolved), `page_path`.

## abkhaz-auto (site)
- `web_vitals` { metric, value, id, rating }
- `form_start` / `form_field_error` { form_id, field } / `form_submit_attempt` / `form_submit_success` / `form_abandon` { form_id }
- (existing: listing_view, listing_engagement, contact_click, category_click, boost_purchase_*, …)

## promo-cabinet (admin)
Кабинет **не пишет** в `user_action_events` (решение владельца 2026-09-09,
см. `docs/2026-09-09-cabinet-audit.md` § 2.8): один общий админский аккаунт,
клики по его кнопкам в BFF были шумом. Удалены `AutoClickTracker`,
`CabinetPageView`, `lib/analytics.ts`, `lib/track-attrs.ts` и роут
`POST /api/track`; `POST /events` BFF кабинет больше не зовёт. Поведение
самого кабинета — в Яндекс.Метрике (`NEXT_PUBLIC_YM_COUNTER_ID`).
Ошибки браузера по-прежнему уходят в BFF `/errors` через `/api/track-error`
(это инцидент-репортинг, не аналитика).
