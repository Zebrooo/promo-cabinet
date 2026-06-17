# Event taxonomy (user_action_events)

All events: snake_case name, flat props with primitive values, ≤2KB.
Auto-enriched: `referrer_source` (web client), `auth_state` (web /api/track), `session_id`, `user_id` (server-resolved), `page_path`.

## abkhaz-auto (site)
- `web_vitals` { metric, value, id, rating }
- `form_start` / `form_field_error` { form_id, field } / `form_submit_attempt` / `form_submit_success` / `form_abandon` { form_id }
- (existing: listing_view, listing_engagement, contact_click, category_click, boost_purchase_*, …)

## promo-cabinet (admin)
- `cabinet_page_view` { page }
- `cabinet_logout`
- `ai_enhance_click` / `ai_enhance_accept` / `ai_enhance_reject` { field? }
- `promo_save_success` { promo_id, format } / `promo_save_failed` { reason }
- `promo_image_upload_success` / `promo_image_upload_failed` { kind: upload|generate }
- `queue_create` / `queue_delete` / `queue_toggle_persist`
