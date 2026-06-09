# Tooltip ad format — promo-cabinet Implementation Plan (2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let an advertiser create a `tooltip` promo in promo-cabinet: select the format, pick a named anchor from a static catalog, and preview it against a sample element. Validation requires an `anchor` for tooltip; the field is persisted and travels to S3 like every other format field.

**Architecture:** The renderer (`@zebrooo/promo-renderer@0.8.0`, already bumped) exports `tooltip` in `FORMATS_BY_DEVICE.desktop`, so the cabinet's existing `allowedFormatsFor()` surfaces it as a tile automatically. We add: `tooltip` to the cabinet's own format enum + an `anchor` field + a "anchor required for tooltip" refinement (`schema.ts`); a static `CANONICAL_ANCHORS` catalog (`catalogue.ts`, mirrors `CANONICAL_QUEUES`); `CAPS`/`FORMAT_LABEL`/caveat/`sanitize` rows + an anchor dropdown (`PromoForm.tsx`); and `anchor` mapping + a sample-anchor preview branch (`PromoPreview.tsx`).

**Tech Stack:** Next.js 14, React 18, TypeScript, zod, vitest (**node environment — no jsdom/RTL**), pnpm. S3-backed catalogue.

**Scope:** promo-cabinet only. The renderer (Plan 1) is done + published 0.8.0. The BFF/storefront (`promozavr` select-promo + abkhaz-auto `data-promo-anchor` markup + its mirrored `catalogue-schema.ts`) is **Plan 3**. Where this plan adds an anchor to the schema, the storefront's mirrored schema must later match (noted, out of scope here).

**Environment (Windows):** Node at `C:\Program Files\nodejs` (NOT on PATH — bash: `export PATH="/c/Program Files/nodejs:$PATH"`; PowerShell: prepend to `$env:Path`). pnpm at `C:\Users\sandro\AppData\Roaming\npm`. `@zebrooo` installs need `NODE_AUTH_TOKEN=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`. Commands: tests `pnpm exec vitest run <file>` / `pnpm test`; typecheck `pnpm typecheck` (`tsc --noEmit`). Work from `C:\Users\sandro\promo-cabinet`, branch `feat/tooltip-cabinet`.

---

## File Structure
- Modify `src/lib/schema.ts` — add `'tooltip'` to `promoFormatSchema`, an `anchor` field, and a tooltip-anchor refinement.
- Modify `src/lib/schema.test.ts` — tooltip+anchor acceptance/rejection tests.
- Modify `src/lib/catalogue.ts` — add `CANONICAL_ANCHORS`.
- Create `src/lib/catalogue.anchors.test.ts` — catalog shape test.
- Modify `src/components/PromoForm.tsx` — `CAPS`/`FORMAT_LABEL`/`formatCaveatFor`/`sanitize` tooltip rows + anchor dropdown section + `CANONICAL_ANCHORS` import.
- Modify `src/components/PromoPreview.tsx` — `toAd` carries `anchor`; tooltip preview branch with a sample `[data-promo-anchor]` element.
- Modify `package.json` + `pnpm-lock.yaml` — dependency bump to `^0.8.0` (already applied locally; committed in Task 1).

Verification per task: schema/catalogue are unit-testable (node env). `PromoForm.tsx`/`PromoPreview.tsx` are `'use client'` React components with **no RTL test harness** here — they are verified by `pnpm typecheck` (TypeScript `Record<Promo['format'], …>` completeness forces the CAPS/FORMAT_LABEL rows) and a final build.

---

## Task 1: Commit the dependency bump

The dep was bumped to `^0.8.0` and `pnpm install` already ran (lockfile updated) so tooltip is available; this task just lands it on the feature branch.

**Files:** `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Create the branch and confirm the bump is present**

Run:
```bash
export PATH="/c/Program Files/nodejs:$PATH"
git checkout -B feat/tooltip-cabinet
grep '@zebrooo/promo-renderer' package.json
```
Expected: shows `"@zebrooo/promo-renderer": "^0.8.0"`. If it still shows `^0.6.1`, set it: `npm pkg set dependencies.@zebrooo/promo-renderer=^0.8.0` and run `pnpm install` (with `NODE_AUTH_TOKEN` exported).

- [ ] **Step 2: Verify tooltip is in the installed package**

Run:
```bash
node -e "console.log(require('@zebrooo/promo-renderer').isFormatAllowed('tooltip','desktop'))"
```
Expected: prints `true`.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(deps): bump @zebrooo/promo-renderer to ^0.8.0 (tooltip format)"
```

---

## Task 2: Schema — `tooltip` format + `anchor` field + refinement

**Files:** Modify `src/lib/schema.ts`; Test `src/lib/schema.test.ts`

- [ ] **Step 1: Write the failing tests** — append inside the existing `describe('promoSchema', …)` block in `src/lib/schema.test.ts`:

```ts
  it('accepts a tooltip promo with an anchor', () => {
    expect(() =>
      promoSchema.parse({
        id: 'tt', name: 'TT', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-02-01T00:00:00.000Z',
        targeting: {}, cooldownHours: 0, format: 'tooltip', title: 'T', anchor: 'home-search',
      }),
    ).not.toThrow();
  });

  it('rejects a tooltip promo without an anchor', () => {
    expect(() =>
      promoSchema.parse({
        id: 'tt', name: 'TT', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-02-01T00:00:00.000Z',
        targeting: {}, cooldownHours: 0, format: 'tooltip', title: 'T',
      }),
    ).toThrow();
  });

  it('does not require anchor for non-tooltip formats', () => {
    expect(() => promoSchema.parse({ ...valid, anchor: undefined })).not.toThrow();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/schema.test.ts`
Expected: FAIL — `format: 'tooltip'` rejected by the enum (and the no-anchor case wrongly passes / the with-anchor case throws on unknown key behavior). At minimum the tooltip-accept tests fail.

- [ ] **Step 3: Edit `src/lib/schema.ts`**

Add `'tooltip'` to the format enum (line 4):
```ts
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen', 'topline', 'divkit', 'tooltip']);
```

Add the `anchor` field to the object — place it right after the `divkitJson` field (the existing line `divkitJson: z.unknown().optional(),`):
```ts
    /** Tooltip-формат: id якоря из CANONICAL_ANCHORS, к элементу которого
     *  привязан пузырёк (хост помечает элемент data-promo-anchor="<id>").
     *  Обязателен когда format==='tooltip' (см. refine ниже). */
    anchor: z.string().min(1).optional(),
```

Add a second refinement — immediately after the existing `.refine((p) => new Date(p.startsAt)… )` block (which ends `})`), chain:
```ts
  .refine((p) => p.format !== 'tooltip' || (typeof p.anchor === 'string' && p.anchor.length > 0), {
    message: 'anchor is required for the tooltip format',
    path: ['anchor'],
  });
```
(Move the trailing `;` to the end of the new refine — the existing chain currently ends with `;` on the first refine's closing.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/lib/schema.test.ts`
Expected: PASS (all existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema.ts src/lib/schema.test.ts
git commit -m "feat(schema): tooltip format + anchor field + required-anchor refinement"
```

---

## Task 3: Anchor catalog — `CANONICAL_ANCHORS`

**Files:** Modify `src/lib/catalogue.ts`; Test `src/lib/catalogue.anchors.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `src/lib/catalogue.anchors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CANONICAL_ANCHORS } from './catalogue';

describe('CANONICAL_ANCHORS', () => {
  it('has at least one anchor, each with a non-empty id, label and pages', () => {
    expect(CANONICAL_ANCHORS.length).toBeGreaterThan(0);
    for (const a of CANONICAL_ANCHORS) {
      expect(a.id).toMatch(/\S/);
      expect(a.label).toMatch(/\S/);
      expect(Array.isArray(a.pages)).toBe(true);
      expect(a.pages.length).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    const ids = CANONICAL_ANCHORS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/catalogue.anchors.test.ts`
Expected: FAIL — `CANONICAL_ANCHORS` is not exported.

- [ ] **Step 3: Add `CANONICAL_ANCHORS` to `src/lib/catalogue.ts`** — directly after the existing `CANONICAL_QUEUES` array (the `export const CANONICAL_QUEUES = [ … ];` block):

```ts
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
];
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/lib/catalogue.anchors.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalogue.ts src/lib/catalogue.anchors.test.ts
git commit -m "feat(catalogue): static page-scoped CANONICAL_ANCHORS for tooltip"
```

---

## Task 4: PromoForm — tooltip rows (CAPS / FORMAT_LABEL / caveat / sanitize)

Adding `'tooltip'` to the schema enum makes `Promo['format']` include it, so the `Record<Promo['format'], …>` constants `CAPS` and `FORMAT_LABEL` now FAIL to typecheck until the tooltip rows are added. The format tile renders automatically (the tiles iterate `allowedFormats` = `FORMATS_BY_DEVICE.desktop`, which includes tooltip).

**Files:** Modify `src/components/PromoForm.tsx`. Verified by typecheck (no RTL harness in this repo).

- [ ] **Step 1: Confirm the typecheck currently fails**

Run: `pnpm typecheck`
Expected: FAIL — `CAPS` and `FORMAT_LABEL` are missing the `tooltip` key (TS2741 "Property 'tooltip' is missing").

- [ ] **Step 2: Add the `tooltip` row to `CAPS`** (after the `divkit:` row, ~line 96):

```ts
  // Tooltip — anchored bubble. Supports a thumbnail, description, CTA, ×-close,
  // colours/textAlign. No bg-image/gradient/variants/bullets. The anchor is a
  // separate required field (dropdown below), not a CAPS boolean.
  tooltip:    { image: true,  description: true,  actionLabel: true,  dismissible: true,  colors: true,  bgImage: false, gradient: false, textAlign: true,  variants: false, bullets: false },
```

- [ ] **Step 3: Add the `tooltip` row to `FORMAT_LABEL`** (after the `divkit:` row, ~line 104):

```ts
  tooltip:    { name: 'Tooltip',    sub: 'Подсказка у элемента' },
```

- [ ] **Step 4: Add the tooltip caveat in `formatCaveatFor`** (inside the function, before `return null;`):

```ts
  if (format === 'tooltip' && target === 'both') {
    return 'Tooltip не покажется на мобильных пользователях';
  }
```

- [ ] **Step 5: Clear `anchor` for non-tooltip in `sanitize`** — add this line to the returned object in `sanitize()` (e.g. right after the `bullets:` line):

```ts
    anchor: p.format === 'tooltip' ? p.anchor : undefined,
```

- [ ] **Step 5b: Add a `tooltip` case to `estimateReach`** — the `switch (fmt)` in `estimateReach(fmt: Promo['format'])` (near the bottom of the file) has no `default`, so adding `'tooltip'` to the enum makes it non-exhaustive ("function lacks ending return"). Add after the `case 'divkit':` line:

```ts
    case 'tooltip':    return 1200;  // anchored bubble, desktop-only
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: exit 0 (CAPS/FORMAT_LABEL now complete; sanitize/caveat valid).

- [ ] **Step 7: Commit**

```bash
git add src/components/PromoForm.tsx
git commit -m "feat(form): tooltip caps/label/caveat + sanitize anchor"
```

---

## Task 5: PromoForm — anchor dropdown (required for tooltip)

**Files:** Modify `src/components/PromoForm.tsx`. Verified by typecheck.

- [ ] **Step 1: Import the catalog** — add to the imports at the top of `src/components/PromoForm.tsx` (near the other `@/lib` imports):

```ts
import { CANONICAL_ANCHORS } from '@/lib/catalogue';
```

- [ ] **Step 2: Add the anchor section** — immediately AFTER the closing `</section>` of the "Format tiles" block (the section that ends with the `formatCaveatFor(...)` hint, right before the `{/* Title */}` section), insert:

```tsx
          {/* Tooltip anchor — required when format=tooltip */}
          {p.format === 'tooltip' && (
            <section className="ef-block">
              <div className="ef-label">ЯКОРЬ</div>
              <select
                className="ef-input"
                value={p.anchor ?? ''}
                onChange={(e) => set({ anchor: e.target.value || undefined })}
              >
                <option value="">Выберите якорь…</option>
                {CANONICAL_ANCHORS.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              {!p.anchor && (
                <div className="hint hint-warn">Выберите элемент, у которого появится тултип.</div>
              )}
            </section>
          )}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/PromoForm.tsx
git commit -m "feat(form): anchor dropdown for tooltip format"
```

---

## Task 6: PromoPreview — carry `anchor` + sample-anchor preview

**Files:** Modify `src/components/PromoPreview.tsx`. Verified by typecheck.

- [ ] **Step 1: Carry `anchor` in `toAd`** — add to the returned object in `toAd(p)` (after the `divkitJson: p.divkitJson,` line):

```ts
    anchor: p.anchor,
```

- [ ] **Step 2: Add the tooltip preview branch** — insert this BETWEEN the `OVERLAY_FORMATS` `if` block and the final `// inline/topline render in flow` return:

```tsx
  // Tooltip points at a host element via data-promo-anchor. The storefront has
  // such an element; in the cabinet we render a sample one so the bubble has an
  // anchor to attach to. Renders in flow (non-blocking, desktop only).
  if (promo.format === 'tooltip') {
    return (
      <div className="preview-panel">
        <p className="preview-note">
          Тултип привязан к якорю «{promo.anchor || '—'}». Превью на образце элемента:
        </p>
        <button
          type="button"
          data-promo-anchor={promo.anchor}
          className="btn"
          style={{ display: 'block', margin: '48px auto' }}
        >
          Образец элемента
        </button>
        <PromoProvider config={{ navigate: noop }}>
          <PromoRenderer ad={ad} />
        </PromoProvider>
      </div>
    );
  }
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: exit 0 (the renderer's `Advertisement` type from 0.8.0 has `anchor?: string`, so `toAd` returning `anchor` typechecks).

- [ ] **Step 4: Commit**

```bash
git add src/components/PromoPreview.tsx
git commit -m "feat(preview): tooltip preview with sample anchor element"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the pure (non-S3) suites touched by this work**

Many route/catalogue tests hit a REAL S3 endpoint and need credentials not available locally — do NOT run the full `pnpm test`. Run the pure suites this plan affects:
Run: `pnpm exec vitest run src/lib/schema.test.ts src/lib/catalogue.anchors.test.ts`
Expected: all PASS (schema incl. the 3 tooltip tests; the 2 anchor-catalog tests).

- [ ] **Step 2: Typecheck (the primary gate for the UI changes)**

Run: `pnpm typecheck`
Expected: exit 0 — this validates `CAPS`/`FORMAT_LABEL` completeness, the `sanitize`/`toAd` field additions, the anchor dropdown JSX, and the schema/`Promo` type.

- [ ] **Step 3: API-route validation is covered by the schema unit tests**

The POST/PUT routes call `promoSchema.parse(...)`, so tooltip+anchor validation runs through the schema (unit-tested in Task 2). The S3-backed route tests (`route.test.ts`) need a live S3 endpoint + credentials and are NOT run here — note this rather than attempting them.

- [ ] **Step 4: Build (best-effort)**

Run: `NODE_AUTH_TOKEN=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 pnpm build`
Expected: `next build` succeeds. If it fails due to MISSING RUNTIME ENV (S3/session secrets needed at build) rather than a type/compile error, record the failure reason and treat typecheck (Step 2) as the gate — do NOT add code to satisfy build-time env. A type or compile error IS a failure to fix.

---

## Self-Review (by plan author)
- **Spec coverage (spec §6 cabinet):** format picker (auto via FORMATS_BY_DEVICE + Task 4 rows); anchor dropdown from static catalog (Tasks 3+5); validation anchor-required + desktop-only caveat (Tasks 2+4); preview against a mock anchor (Task 6); persistence (anchor rides the Promo object through sanitize → `/api/promos` → S3, no special handling — Task 4 sanitize + Task 6 toAd). Renderer release (Plan-1 prereq) done = published 0.8.0.
- **Placeholders:** none — every code step shows real code matching the read source (CAPS/FORMAT_LABEL `Record` shape, `sanitize` field list, `toAd` shape, the divkit conditional-block pattern, schema enum/refine).
- **Type consistency:** `anchor` is `string|undefined` everywhere (schema field, `Promo['anchor']`, `set({ anchor })`, `toAd` → `Advertisement.anchor` (0.8.0)). `CANONICAL_ANCHORS` item shape `{id,label,pages}` consistent between catalogue, test, and the dropdown (`a.id`/`a.label`).
- **Test-env caveat:** form/preview have no unit tests (repo vitest env is `node`, no RTL); they are typecheck-gated, which is sufficient because the changes are TS-`Record` completeness + a conditional JSX block + an object-field addition. Stated up front.
- **Out of scope (Plan 3):** storefront `data-promo-anchor` markup, the BFF page-scoped serving of tooltip, and abkhaz-auto's mirrored `catalogue-schema.ts` (must gain `tooltip`+`anchor` to accept these promos) — noted in §Scope.
