# Topline format · per-format form fields · in-form preview — Design

**Date:** 2026-05-25
**Repos:** `promo-renderer` (local `abhazPromo`), `abhPromo`, `promo-cabinet`

## Goal

Three linked changes to the promo cabinet, agreed with the user:

1. Add a new promo **format `topline`** (a thin top banner) across all three repos so it
   renders, validates, and selects consistently.
2. The cabinet create/edit form shows a **different set of fields per format**
   (e.g. topline has no image and no button).
3. The cabinet form shows a **live preview** of the promo rendered with the
   `promo-renderer` package — in the form only.

Also: **a promo's `format` cannot be changed after creation** (the `format` select is
disabled in edit mode, like `id`).

## Format model agreement

`PromoFormat` becomes `'inline' | 'popup' | 'fullscreen' | 'topline'`. This enum must
stay identical in:
- `promo-renderer` → `src/model.ts` (`PromoFormat`)
- `abhPromo` → `src/promo-selector/types.ts` (`PromoFormat`) and
  `src/services/catalogue-schema.ts` (`promoFormatSchema`)
- `promo-cabinet` → `src/lib/schema.ts` (`promoFormatSchema`)

The zod schema stays **permissive** (all renderable fields remain optional). Per-format
field rules are enforced by the **form UX + submit-time sanitization**, not the schema —
this keeps the abhPromo/renderer change minimal (enum only) and avoids cross-repo
refinement drift.

## 1. `topline` in `promo-renderer`

- New `src/formats/ToplinePromo.tsx` (+ `ToplinePromo.module.css`):
  a full-width banner rendered **in flow** (not a portal/overlay — like `InlinePromo`),
  so the host app places it at the top of the page and the cabinet can preview it inline.
  - Shows `ad.title` (bold) and `ad.description` (secondary).
  - If `ad.action?.href` is set, the **whole banner is clickable** (calls the same
    `handleAction` path as other formats via `usePromoActions`). No separate CTA button.
  - If `ad.dismissible !== false`, shows a close `×` that calls `handleClose('user')`.
  - No image.
- `src/model.ts`: add `'topline'` to `PromoFormat`.
- `src/PromoRenderer.tsx`: route `case 'topline': return <ToplinePromo ad={ad} {...callbacks} />;`
- Tests: `ToplinePromo.test.tsx` (renders title/description; banner link present only with
  action; `×` present only when dismissible; no `<img>`); extend `PromoRenderer.test.tsx`
  routing.
- Rebuild `dist` (`npm run build` / tsup) so the cabinet `file:` dependency sees it; bump
  package version to `0.2.0`.

## 2. `topline` in `abhPromo`

- `src/promo-selector/types.ts`: add `'topline'` to `PromoFormat`.
- `src/services/catalogue-schema.ts`: add `'topline'` to `promoFormatSchema`.
- No selection-logic change (format is renderable metadata only). Existing tests stay
  green; add one assertion that a `topline` promo parses.

## 3. `promo-cabinet`: schema, per-format form, preview, locked format

### 3a. Schema
- `src/lib/schema.ts`: add `'topline'` to `promoFormatSchema` (keeps the `startsAt<endsAt`
  refinement). Add a schema-test case accepting a `topline` promo.

### 3b. Consume the renderer package
- Add dependency `"promo-renderer": "file:../abhazPromo"` and `npm install`.
- Import the package stylesheet once in `src/app/layout.tsx`: `import 'promo-renderer/styles.css';`
  (global, scoped CSS-module output — safe).

### 3c. Per-format fields (form)
Common fields, always shown: `id` (locked on edit), `name`, `format` (**locked on edit**),
start/end datetime pickers, targeting, `maxImpressionsPerUser`, `cooldownHours`, `title`.
Format-specific:

| format | imageUrl | description | action | dismissible |
|---|---|---|---|---|
| topline | — | shown | href only (whole banner) | shown |
| inline | shown | shown | href + label | — |
| popup | shown | shown | href + label | shown |
| fullscreen | shown | shown | href + label | shown |

On submit, **sanitize** the promo to the format: drop fields not used by the chosen format
(e.g. topline → `imageUrl` and `action.label` undefined; inline → `dismissible` undefined)
so stored data matches the format.

### 3d. In-form preview (`PromoPreview` client component)
- Maps the in-progress promo to the renderer's `Advertisement` subset
  `{ id, format, title, description?, imageUrl?, action?, dismissible? }`.
- Renders `<PromoProvider config={{ navigate: () => {} }}><PromoRenderer ad={ad} /></PromoProvider>`
  and nothing else. **No per-format branching in the cabinet** — the root `PromoRenderer`
  receives the promo and itself decides which format component to show. `inline`/`topline`
  render in the contained preview panel; `popup`/`fullscreen` open their real overlay
  (portal to body) with their own `×`, exactly as they would in a host app.
- If `title` is empty, show a hint ("Заполните заголовок…") instead of rendering.

### 3e. Locked format
- `PromoForm`: `format` `<select disabled={mode === 'edit'}>` (mirrors the existing `id` lock).

## Testing / gates

- **promo-renderer**: `npm test` green incl. new ToplinePromo + routing tests; `npm run build`
  regenerates `dist`; `npm run typecheck` 0.
- **abhPromo**: `npm test` green (61 + topline-parse assertion); `npm run typecheck` 0.
- **promo-cabinet**: `npm test` green (schema accepts topline); `npm run typecheck` 0;
  `npm run build` succeeds (preview/package import compile).

## Out of scope

- Strict per-format schema validation (kept permissive; form sanitizes).
- Preview on list cards (form-only per decision).
- Publishing `promo-renderer` to a registry (local `file:` dependency).
