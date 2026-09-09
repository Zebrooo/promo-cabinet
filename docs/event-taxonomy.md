# Event taxonomy (user_action_events)

All events: snake_case name, flat props with primitive values, ≤2KB.
Auto-enriched: `referrer_source` (web client), `auth_state` (web /api/track), `session_id`, `user_id` (server-resolved), `page_path`.

## abkhaz-auto (site)
- `web_vitals` { metric, value, id, rating }
- `form_start` / `form_field_error` { form_id, field } / `form_submit_attempt` / `form_submit_success` / `form_abandon` { form_id }
- (existing: listing_view, listing_engagement, contact_click, category_click, boost_purchase_*, …)

## promo-cabinet (admin)
Фактически отправляемые события (см. `grep trackEvent( src`):
- `cabinet_page_view` { page }
- `promo_save_success` { promo_id, format } / `promo_save_failed` { reason }
- `promo_delete_success` { promo_id, format }
- `promo_duplicate` { id } — клик «Дублировать» в редакторе (через data-track; само сохранение копии — обычный `promo_save_success`)
- `promo_image_upload_success` / `promo_image_upload_failed` { kind: upload|generate }
- `push_subscribe_success` / `push_unsubscribe` — Web Push-подписка админа на пуши о новых кампаниях (клики по кнопкам: `push_enable` / `push_disable` через data-track)
