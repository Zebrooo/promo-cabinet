# Topline format + per-format fields + in-form preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `topline` promo format across the renderer package + both services, make the cabinet form show per-format fields with an in-form live preview rendered by the `promo-renderer` package, and lock a promo's format after creation.

**Architecture:** Three repos. (A) `promo-renderer` (local `c:\Users\Yarrrr\Desktop\abhazPromo`) gains a `ToplinePromo` in-flow banner + `'topline'` in `PromoFormat`, routed by `PromoRenderer`; rebuild `dist`. (B) `abhPromo` and (C) `promo-cabinet` add `'topline'` to their (permissive) zod format enums. (C) consumes the renderer via a `file:` dependency, shows per-format form fields, sanitizes on submit, and renders a live preview.

**Tech Stack:** React 18, TypeScript, Vitest 3, @testing-library/react, tsup (renderer build), Next.js 14 (cabinet), zod.

**Build order:** Phase A (renderer) first — Phase C depends on the rebuilt `dist`. Phase B is independent.

---

## Phase A — `promo-renderer` (run all commands from `c:\Users\Yarrrr\Desktop\abhazPromo`)

### Task A1: Add `topline` to the format type

**Files:**
- Modify: `src/model.ts`

- [ ] **Step 1: Add the literal**

In `src/model.ts` change:
```ts
export type PromoFormat = 'inline' | 'popup' | 'fullscreen';
```
to:
```ts
export type PromoFormat = 'inline' | 'popup' | 'fullscreen' | 'topline';
```

- [ ] **Step 2: Commit**

```bash
git add src/model.ts
git commit -m "feat: add 'topline' to PromoFormat"
```

---

### Task A2: ToplinePromo component (TDD)

**Files:**
- Create: `src/formats/ToplinePromo.test.tsx`
- Create: `src/formats/ToplinePromo.tsx`
- Create: `src/formats/ToplinePromo.module.css`

- [ ] **Step 1: Write the failing test**

Create `src/formats/ToplinePromo.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { PromoProvider } from '../PromoProvider';
import { ToplinePromo } from './ToplinePromo';
import type { Advertisement } from '../model';

const ad: Advertisement = {
  id: 't1', format: 'topline', title: 'Заголовок', description: 'Описание',
  action: { href: '/promo/1' },
};

function renderWithProvider(ui: ReactElement, navigate = vi.fn()) {
  return { navigate, ...render(<PromoProvider config={{ navigate }}>{ui}</PromoProvider>) };
}

describe('ToplinePromo', () => {
  it('renders title and description', () => {
    renderWithProvider(<ToplinePromo ad={ad} />);
    expect(screen.getByText('Заголовок')).toBeInTheDocument();
    expect(screen.getByText('Описание')).toBeInTheDocument();
  });

  it('renders no image', () => {
    const { container } = renderWithProvider(<ToplinePromo ad={{ ...ad, imageUrl: 'https://x/y.png' }} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('makes the whole banner a link that fires onAction then navigates', () => {
    const onAction = vi.fn();
    const { navigate } = renderWithProvider(<ToplinePromo ad={ad} onAction={onAction} />);
    screen.getByRole('link').click();
    expect(onAction).toHaveBeenCalledWith(ad);
    expect(navigate).toHaveBeenCalledWith('/promo/1');
  });

  it('renders no link role when there is no action', () => {
    const { action, ...noAction } = ad;
    renderWithProvider(<ToplinePromo ad={noAction} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a close button when dismissible (default) and fires onClose', () => {
    const onClose = vi.fn();
    renderWithProvider(<ToplinePromo ad={ad} onClose={onClose} />);
    screen.getByRole('button', { name: 'Закрыть' }).click();
    expect(onClose).toHaveBeenCalledWith(ad, 'user');
  });

  it('hides the close button when dismissible is false', () => {
    renderWithProvider(<ToplinePromo ad={{ ...ad, dismissible: false }} />);
    expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/formats/ToplinePromo.test.tsx`
Expected: FAIL — module not found (`ToplinePromo`).

- [ ] **Step 3: Create the stylesheet**

Create `src/formats/ToplinePromo.module.css`:
```css
.topline { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 14px; background: #111; color: #fff; box-sizing: border-box; }
.body { display: flex; gap: 8px; align-items: baseline; flex: 1; min-width: 0; border: none; background: none; color: inherit; text-align: left; font: inherit; padding: 0; }
.clickable { cursor: pointer; }
.title { font-weight: 600; font-size: 14px; }
.description { font-size: 14px; color: #cfcfcf; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.close { flex: none; border: none; background: transparent; color: #fff; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 4px; }
```

- [ ] **Step 4: Create the component**

Create `src/formats/ToplinePromo.tsx`:
```tsx
import { usePromoActions } from './usePromoActions';
import type { FormatProps } from './types';
import styles from './ToplinePromo.module.css';

/** A full-width banner rendered in flow (no portal). The whole bar is the link. */
export function ToplinePromo({ ad, onAction, onClose }: FormatProps) {
  const { handleAction, handleClose, strings } = usePromoActions(ad, { onAction, onClose });
  const dismissible = ad.dismissible ?? true;
  const clickable = Boolean(ad.action);

  return (
    <div className={styles.topline} data-testid="promo-topline">
      {clickable ? (
        <button type="button" className={`${styles.body} ${styles.clickable}`} role="link" onClick={handleAction}>
          <span className={styles.title}>{ad.title}</span>
          {ad.description && <span className={styles.description}>{ad.description}</span>}
        </button>
      ) : (
        <div className={styles.body}>
          <span className={styles.title}>{ad.title}</span>
          {ad.description && <span className={styles.description}>{ad.description}</span>}
        </div>
      )}
      {dismissible && (
        <button type="button" className={styles.close} aria-label={strings.closeButton} onClick={() => handleClose('user')}>
          ×
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/formats/ToplinePromo.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/formats/ToplinePromo.tsx src/formats/ToplinePromo.module.css src/formats/ToplinePromo.test.tsx
git commit -m "feat: add ToplinePromo banner format"
```

---

### Task A3: Route `topline` in PromoRenderer (TDD)

**Files:**
- Modify: `src/PromoRenderer.tsx`
- Modify: `src/PromoRenderer.test.tsx`

- [ ] **Step 1: Add the failing routing test**

In `src/PromoRenderer.test.tsx`, add inside `describe('PromoRenderer', ...)` after the fullscreen test:
```ts
  it('routes topline ads to ToplinePromo', () => {
    renderWith({ id: '4', format: 'topline', title: 'T' });
    expect(screen.getByTestId('promo-topline')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/PromoRenderer.test.tsx`
Expected: FAIL — `topline` falls through to `default` → `null`, testId not found.

- [ ] **Step 3: Add the route**

In `src/PromoRenderer.tsx`, add the import:
```ts
import { ToplinePromo } from './formats/ToplinePromo';
```
and add a case before `default:` in the switch:
```ts
    case 'topline':
      return <ToplinePromo ad={ad} {...callbacks} />;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/PromoRenderer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PromoRenderer.tsx src/PromoRenderer.test.tsx
git commit -m "feat: route topline ads to ToplinePromo"
```

---

### Task A4: Full suite, typecheck, rebuild dist, version bump

**Files:**
- Modify: `package.json` (version)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — all renderer suites green (including the new ToplinePromo + routing).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors).

- [ ] **Step 3: Bump version**

In `package.json` change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 4: Rebuild the dist the cabinet consumes**

Run: `npm run build`
Expected: succeeds; `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.css` regenerated.

- [ ] **Step 5: Commit**

```bash
git add package.json dist
git commit -m "chore: build promo-renderer 0.2.0 (topline)"
```

---

## Phase B — `abhPromo` (run all commands from `c:\Users\Yarrrr\Desktop\abhPromo`)

### Task B1: Accept `topline` in the catalogue schema (TDD)

**Files:**
- Modify: `src/promo-selector/types.ts`
- Modify: `src/services/catalogue-schema.ts`
- Modify: `src/services/catalogue-schema.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/services/catalogue-schema.test.ts`, add inside `describe('promoSchema', ...)`:
```ts
  it('accepts the topline format', () => {
    expect(() => promoSchema.parse(makePromo({ format: 'topline' }))).not.toThrow();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/catalogue-schema.test.ts`
Expected: FAIL — `promoFormatSchema` enum rejects `'topline'`.

- [ ] **Step 3: Add `topline` to the enum and domain type**

In `src/services/catalogue-schema.ts` change:
```ts
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen']);
```
to:
```ts
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen', 'topline']);
```

In `src/promo-selector/types.ts` change:
```ts
export type PromoFormat = 'inline' | 'popup' | 'fullscreen';
```
to:
```ts
export type PromoFormat = 'inline' | 'popup' | 'fullscreen' | 'topline';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/catalogue-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `npm test`
Expected: PASS (62 tests).
Run: `npm run typecheck`
Expected: PASS (0 errors).

- [ ] **Step 6: Commit**

```bash
git add src/promo-selector/types.ts src/services/catalogue-schema.ts src/services/catalogue-schema.test.ts
git commit -m "feat: accept topline format in catalogue schema"
```

---

## Phase C — `promo-cabinet` (run all commands from `c:\Users\Yarrrr\Desktop\promo-cabinet`)

### Task C1: Accept `topline` in the cabinet schema (TDD)

**Files:**
- Modify: `src/lib/schema.ts`
- Modify: `src/lib/schema.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/lib/schema.test.ts`, add inside `describe('promoSchema', ...)`:
```ts
  it('accepts the topline format', () => {
    expect(() =>
      promoSchema.parse({
        id: 'tl', name: 'TL', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-02-01T00:00:00.000Z',
        targeting: {}, maxImpressionsPerUser: 0, cooldownHours: 0, format: 'topline', title: 'T',
      }),
    ).not.toThrow();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/schema.test.ts`
Expected: FAIL — enum rejects `'topline'`.

- [ ] **Step 3: Add `topline` to the enum**

In `src/lib/schema.ts` change:
```ts
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen']);
```
to:
```ts
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen', 'topline']);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema.ts src/lib/schema.test.ts
git commit -m "feat: accept topline format in cabinet schema"
```

---

### Task C2: Depend on the renderer package + load its CSS

**Files:**
- Modify: `package.json`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add the dependency**

In `package.json`, add to `"dependencies"` (alphabetical position is fine):
```json
    "promo-renderer": "file:../abhazPromo",
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: completes; `node_modules/promo-renderer` present (linked to the built `dist`).

- [ ] **Step 3: Import the package stylesheet once**

In `src/app/layout.tsx`, add after the existing `import './globals.css';` line:
```ts
import 'promo-renderer/styles.css';
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/app/layout.tsx
git commit -m "chore: depend on promo-renderer (file:) and load its styles"
```

---

### Task C3: Preview component

**Files:**
- Create: `src/components/PromoPreview.tsx`

- [ ] **Step 1: Create the preview component**

Create `src/components/PromoPreview.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { PromoProvider, PromoRenderer, type Advertisement } from 'promo-renderer';
import type { Promo } from '@/lib/schema';

const OVERLAY = new Set(['popup', 'fullscreen']);

/** Map an in-progress promo to the renderer's Advertisement subset. */
function toAd(p: Promo): Advertisement {
  return {
    id: p.id || 'preview',
    format: p.format,
    title: p.title,
    description: p.description,
    imageUrl: p.imageUrl,
    action: p.action,
    dismissible: p.dismissible,
  };
}

export function PromoPreview({ promo }: { promo: Promo }) {
  const [openKey, setOpenKey] = useState(0);

  if (!promo.title) {
    return <div className="preview-hint">Заполните заголовок, чтобы увидеть превью.</div>;
  }
  const ad = toAd(promo);

  if (OVERLAY.has(promo.format)) {
    return (
      <div className="preview-panel">
        <button type="button" onClick={() => setOpenKey((k) => k + 1)}>Показать превью</button>
        {openKey > 0 && (
          <PromoProvider key={openKey} config={{ navigate: () => {} }}>
            <PromoRenderer ad={ad} />
          </PromoProvider>
        )}
      </div>
    );
  }

  return (
    <div className="preview-panel">
      <PromoProvider config={{ navigate: () => {} }}>
        <PromoRenderer ad={ad} />
      </PromoProvider>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS (0 errors). (Confirms the `promo-renderer` types resolve and `Promo['format']` is assignable to `Advertisement['format']` — both include `topline`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/PromoPreview.tsx
git commit -m "feat: add in-form PromoPreview (renders via promo-renderer)"
```

---

### Task C4: Per-format form fields, locked format, sanitize, embedded preview

**Files:**
- Modify: `src/components/PromoForm.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace `src/components/PromoForm.tsx` entirely**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';
import { PromoPreview } from './PromoPreview';

const FORMATS = ['topline', 'inline', 'popup', 'fullscreen'] as const;

type Caps = { image: boolean; description: boolean; actionLabel: boolean; dismissible: boolean };
const CAPS: Record<Promo['format'], Caps> = {
  topline: { image: false, description: true, actionLabel: false, dismissible: true },
  inline: { image: true, description: true, actionLabel: true, dismissible: false },
  popup: { image: true, description: true, actionLabel: true, dismissible: true },
  fullscreen: { image: true, description: true, actionLabel: true, dismissible: true },
};

const empty: Promo = {
  id: '', name: '', startsAt: '', endsAt: '', targeting: {},
  maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline', title: '',
};

/** Stored value is ISO-8601 (UTC). The native picker works in local wall-clock. */
function isoToLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

/** Drop fields the chosen format does not use, so stored data matches the format. */
function sanitize(p: Promo): Promo {
  const c = CAPS[p.format];
  const out: Promo = { ...p };
  if (!c.image) delete out.imageUrl;
  if (!c.description) delete out.description;
  if (!c.dismissible) delete out.dismissible;
  if (out.action && !c.actionLabel) out.action = { href: out.action.href };
  return out;
}

export function PromoForm({ initial, mode }: { initial?: Promo; mode: 'create' | 'edit' }) {
  const router = useRouter();
  const [p, setP] = useState<Promo>(initial ?? empty);
  const [error, setError] = useState('');
  const set = (patch: Partial<Promo>) => setP((cur) => ({ ...cur, ...patch }));
  const caps = CAPS[p.format];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const body = sanitize(p);
    const url = mode === 'create' ? '/api/promos' : `/api/promos/${encodeURIComponent(p.id)}`;
    const method = mode === 'create' ? 'POST' : 'PUT';
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) router.push('/cabinet');
    else {
      const data = await res.json().catch(() => ({}));
      setError(`Ошибка: ${data.error ?? res.status}`);
    }
  }

  return (
    <div className="form-layout">
      <form className="form-card" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>ID (slug)</label>
            <input className="mono-input" value={p.id} disabled={mode === 'edit'} onChange={(e) => set({ id: e.target.value })} placeholder="summer-sale" />
          </div>
          <div className="field">
            <label>Формат{mode === 'edit' ? ' (нельзя изменить)' : ''}</label>
            <select value={p.format} disabled={mode === 'edit'} onChange={(e) => set({ format: e.target.value as Promo['format'] })}>
              {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="field field--full">
            <label>Название (внутреннее)</label>
            <input value={p.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="field field--full">
            <label>Заголовок</label>
            <input value={p.title} onChange={(e) => set({ title: e.target.value })} />
          </div>

          {caps.description && (
            <div className="field field--full">
              <label>Описание</label>
              <textarea value={p.description ?? ''} onChange={(e) => set({ description: e.target.value || undefined })} />
            </div>
          )}

          {caps.image && (
            <div className="field field--full">
              <label>Картинка (URL)</label>
              <input className="mono-input" value={p.imageUrl ?? ''} onChange={(e) => set({ imageUrl: e.target.value || undefined })} placeholder="https://…" />
            </div>
          )}

          <div className="field">
            <label>Начало показа</label>
            <input type="datetime-local" lang="ru" value={isoToLocalInput(p.startsAt)} onChange={(e) => set({ startsAt: localInputToIso(e.target.value) })} />
          </div>
          <div className="field">
            <label>Окончание показа</label>
            <input type="datetime-local" lang="ru" value={isoToLocalInput(p.endsAt)} onChange={(e) => set({ endsAt: localInputToIso(e.target.value) })} />
          </div>

          <div className="field">
            <label>Макс. показов (0 = ∞)</label>
            <input type="number" min={0} value={p.maxImpressionsPerUser} onChange={(e) => set({ maxImpressionsPerUser: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Кулдаун, часов (0 = нет)</label>
            <input type="number" min={0} value={p.cooldownHours} onChange={(e) => set({ cooldownHours: Number(e.target.value) })} />
          </div>

          <div className="field">
            <label>{caps.actionLabel ? 'CTA href (необязательно)' : 'Ссылка баннера (необязательно)'}</label>
            <input className="mono-input" value={p.action?.href ?? ''}
              onChange={(e) => set({ action: e.target.value ? { href: e.target.value, label: caps.actionLabel ? p.action?.label : undefined } : undefined })}
              placeholder="/sale/summer" />
          </div>
          {caps.actionLabel && (
            <div className="field">
              <label>CTA label (необязательно)</label>
              <input value={p.action?.label ?? ''} disabled={!p.action?.href}
                onChange={(e) => set({ action: p.action?.href ? { href: p.action.href, label: e.target.value || undefined } : undefined })} />
            </div>
          )}
          {caps.dismissible && (
            <div className="field">
              <label>Можно закрыть (×)</label>
              <select value={(p.dismissible ?? true) ? 'yes' : 'no'} onChange={(e) => set({ dismissible: e.target.value === 'yes' })}>
                <option value="yes">Да</option>
                <option value="no">Нет</option>
              </select>
            </div>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="primary">Сохранить</button>
          <button type="button" onClick={() => router.push('/cabinet')}>Отмена</button>
        </div>
      </form>

      <aside className="preview-aside">
        <p className="kicker">Превью</p>
        <PromoPreview promo={p} />
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Add preview/layout styles**

Append to `src/app/globals.css`:
```css
/* form + preview two-column layout */
.form-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 1.25rem; align-items: start; }
.form-layout .form-card { max-width: none; }
.preview-aside { position: sticky; top: 5rem; display: flex; flex-direction: column; gap: 0.6rem; }
.preview-panel {
  border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--surface-2); padding: 1rem; min-height: 90px;
  display: flex; flex-direction: column; gap: 0.6rem; align-items: flex-start;
}
.preview-hint { color: var(--text-faint); font-size: 0.86rem; padding: 1rem; border: 1px dashed var(--border-2); border-radius: var(--radius); }
@media (max-width: 860px) { .form-layout { grid-template-columns: 1fr; } .preview-aside { position: static; } }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS (0 errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/PromoForm.tsx src/app/globals.css
git commit -m "feat: per-format form fields + locked format + embedded preview"
```

---

### Task C5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Test suite**

Run: `npm test`
Expected: PASS — schema accepts topline; all other suites still green.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds — the `promo-renderer` import and `PromoPreview` client component compile; pages build.

- [ ] **Step 4: Manual smoke (optional, dev server)**

Run: `npm run dev`, log in, open `/cabinet/new`, switch format to `topline` (image/CTA-label/… fields hide, banner-link + dismissible appear) and watch the live preview; switch to `popup`, fill a title, click «Показать превью» (overlay opens). Edit an existing promo and confirm the format select is disabled.

---

## Done

`topline` renders/validates/selects across all three repos; the cabinet form adapts its fields per format, locks the format on edit, sanitizes on save, and shows a live in-form preview via the `promo-renderer` package.
