# Named queues + skipCheckers + audience + real impressions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Multi-queue, condition-aware promo selection — the BFF resolves a queue by **name** from S3, runs the checker chain minus a request-supplied `skipCheckers` set (and auto-skips frequency for `persist` queues), honours an **audience** (all/authenticated/anonymous) target, and uses **real per-user impression data** supplied by the consumer (stored in abkhaz-auto's Supabase).

**Architecture:** S3 gains `queues.json` (index) + `queue-<name>.json` (`{persist, ids}`). BFF: named checkers + `audience` checker + `selectPromo(..., skip)`; `/models` accepts `params.queue`, `params.skipCheckers`, `params.user`. Cabinet: audience field + named-queue store/API/UI. abkhaz-auto: Supabase impressions, userId cookie, per-page slot config, `/api/promo/seen`.

**Tech:** TS, zod, Vitest (real bucket.ru S3), Fastify, Next 14 (cabinet) / Next 16 (abkhaz-auto), Supabase Postgres.

**Build order:** A (BFF) → B (cabinet) → C (abkhaz-auto) → D (deploy). A and B are independent of C.

Spec: `docs/superpowers/specs/2026-05-26-named-queues-skipcheckers-audience-impressions.md`.

---

## Phase A — BFF (`c:\Users\Yarrrr\Desktop\abhPromo`, branch `feat/s3-queue-cooldown`)

### Task A1: `audience` field in schema + domain type (TDD)
**Files:** `src/services/catalogue-schema.ts`, `src/promo-selector/types.ts`, `src/services/catalogue-schema.test.ts`

- [ ] **Step 1 — failing test** in `catalogue-schema.test.ts` (inside the promoSchema describe):
```ts
  it('accepts an audience target', () => {
    expect(() => promoSchema.parse(makePromo({ audience: 'authenticated' }))).not.toThrow();
    expect(() => promoSchema.parse(makePromo({ audience: 'nope' as never }))).toThrow();
  });
```
- [ ] **Step 2 — run** `npx vitest run src/services/catalogue-schema.test.ts` → FAIL.
- [ ] **Step 3 — implement.** In `catalogue-schema.ts` add `export const audienceSchema = z.enum(['all','authenticated','anonymous']);` and add to `promoSchema` object: `audience: audienceSchema.optional(),`. In `promo-selector/types.ts` add to `Promo`: `audience?: 'all' | 'authenticated' | 'anonymous';`.
- [ ] **Step 4 — run** → PASS.
- [ ] **Step 5 — commit** `git add -A && git commit -m "feat: audience target in promo schema"`

### Task A2: named checkers + `audience` checker + `selectPromo(..., skip)` (TDD)
**Files:** `src/promo-selector/checkers/audience-checker.ts` (+ test), `src/promo-selector/index.ts`, `src/promo-selector/types.ts`, `src/promo-selector/index.test.ts`

- [ ] **Step 1 — UserData gains `authenticated`.** In `types.ts` add `authenticated: boolean;` to `UserData`. Add a named-checker type:
```ts
export interface NamedChecker { name: string; check: Checker; }
```
- [ ] **Step 2 — audience checker (TDD).** Create `src/promo-selector/checkers/audience-checker.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { audienceChecker } from './audience-checker';
import { makeUser, makePromo } from '../../test-utils';

const cfg = { now: new Date() };
describe('audienceChecker', () => {
  it('passes when audience is unset or all', () => {
    expect(audienceChecker(makeUser({ authenticated: false }), makePromo({}), cfg)).toBe(true);
    expect(audienceChecker(makeUser({ authenticated: true }), makePromo({ audience: 'all' }), cfg)).toBe(true);
  });
  it('authenticated-only requires a logged-in user', () => {
    expect(audienceChecker(makeUser({ authenticated: true }), makePromo({ audience: 'authenticated' }), cfg)).toBe(true);
    expect(audienceChecker(makeUser({ authenticated: false }), makePromo({ audience: 'authenticated' }), cfg)).toBe(false);
  });
  it('anonymous-only requires a guest', () => {
    expect(audienceChecker(makeUser({ authenticated: false }), makePromo({ audience: 'anonymous' }), cfg)).toBe(true);
    expect(audienceChecker(makeUser({ authenticated: true }), makePromo({ audience: 'anonymous' }), cfg)).toBe(false);
  });
});
```
(Confirm `test-utils` has `makeUser`/`makePromo`; if `makeUser` is missing, add a minimal one to `test-utils.ts` that returns a valid `UserData` with `authenticated:false` default and accepts overrides.)
- [ ] **Step 3 — run** → FAIL (module missing).
- [ ] **Step 4 — implement** `src/promo-selector/checkers/audience-checker.ts`:
```ts
import type { Checker } from '../types';

/** Gate by login state: 'all' (or unset) always passes; 'authenticated' needs a logged-in
 *  user; 'anonymous' needs a guest. */
export const audienceChecker: Checker = (user, promo) => {
  const a = promo.audience ?? 'all';
  if (a === 'all') return true;
  if (a === 'authenticated') return user.authenticated === true;
  return user.authenticated !== true; // 'anonymous'
};
```
- [ ] **Step 5 — named checkers + skip in index.ts.** Rewrite `src/promo-selector/index.ts`:
```ts
import type { Checker, CheckerConfig, NamedChecker, Promo, UserData } from './types';
import { dateChecker } from './checkers/date-checker';
import { userChecker } from './checkers/user-checker';
import { audienceChecker } from './checkers/audience-checker';
import { limitChecker } from './checkers/limit-checker';
import { cooldownChecker } from './checkers/cooldown-checker';

/** Named, ordered cheap→expensive. Skip by name via `selectPromo(..., skip)`. */
export const defaultCheckers: NamedChecker[] = [
  { name: 'date', check: dateChecker },
  { name: 'targeting', check: userChecker },
  { name: 'audience', check: audienceChecker },
  { name: 'limit', check: limitChecker },
  { name: 'cooldown', check: cooldownChecker },
];

export function selectPromo(
  promos: Promo[],
  userData: UserData,
  config: CheckerConfig,
  skip: string[] = [],
  checkers: NamedChecker[] = defaultCheckers,
): Promo | null {
  const active = checkers.filter((c) => !skip.includes(c.name));
  for (const promo of promos) {
    if (active.every(({ check }) => check(userData, promo, config))) return promo;
  }
  return null;
}
```
- [ ] **Step 6 — update `index.test.ts`** for the new signature: existing calls become `selectPromo(promos, user, cfg)`; add a skip test:
```ts
  it('skips named checkers in the skip list', () => {
    // a promo that fails `limit` but would pass with limit skipped
    const promos = [makePromo({ id: 'a', maxImpressionsPerUser: 1 })];
    const user = makeUser({ impressionCounts: { a: 5 } });
    expect(selectPromo(promos, user, { now: new Date() })).toBeNull();
    expect(selectPromo(promos, user, { now: new Date() }, ['limit'])?.id).toBe('a');
  });
```
Update any other `selectPromo` callers/tests for the added `skip` arg (it's before `checkers`, both optional → existing 3-arg calls still compile).
- [ ] **Step 7 — run** `npx vitest run src/promo-selector` → PASS.
- [ ] **Step 8 — commit** `git commit -am "feat: named checkers + audience checker + selectPromo skip"`

### Task A3: read a queue by name + persist auto-skip (TDD)
**Files:** `src/services/s3-client.ts`, `src/services/catalogue-schema.ts`, `src/services/config-service.ts`, `src/services/config-service.test.ts`

- [ ] **Step 1 — keys + queue schema.** In `s3-client.ts` replace `queueKey()` with `queueKey(name: string)` → `${config.s3.keyPrefix}queue-${name}.json`, keep `promosKey()`. In `catalogue-schema.ts` add `export const queueObjectSchema = z.object({ persist: z.boolean().default(false), ids: z.array(z.string().min(1)).default([]) });` (keep `queueSchema` for the bare-id arrays used elsewhere).
- [ ] **Step 2 — config-service select-by-queue.** Rewrite `config-service.ts` so `getPromos` takes a queue name and returns `{ promos: Promo[]; persist: boolean }`:
```ts
export interface ConfigService {
  /** Ordered active promos for a named queue + the queue's persist flag. */
  getQueue(queueName: string): Promise<{ promos: Promo[]; persist: boolean }>;
}
```
Implementation: read `queue-<name>.json` via `queueObjectSchema` (missing → `{persist:false, ids:[]}`), read `promos.json` via `poolSchema`, join ids→pool (skip dangling), return `{ promos, persist }`. Reuse the existing `readObject` null-on-missing helper.
- [ ] **Step 3 — tests.** Rewrite `config-service.test.ts`: seed `promos.json` + `queue-home.json` `{persist:true, ids:[...]}`; assert `getQueue('home')` returns ordered promos + `persist:true`; missing queue → `{promos:[],persist:false}`; dangling id skipped.
- [ ] **Step 4 — run** → PASS.
- [ ] **Step 5 — commit** `git commit -am "feat: BFF reads named queue (queue-<name>.json) + persist flag"`

### Task A4: request params (queue, skipCheckers, user) wired through validate + handle
**Files:** `src/models/select-promo/types.ts`, `src/models/select-promo/validate.ts`, `src/models/select-promo/handle.ts` (+ their tests)

- [ ] **Step 1 — params type + validation (TDD).** `SelectPromoParams` gains `queue?: string` (default `'main'`), `skipCheckers?: string[]`, `user?: { id?: string; authenticated?: boolean; impressions?: Record<string,number>; lastShownAt?: Record<string,string>; age?: number; region?: string; subscriptionLevel?: SubscriptionLevel }`. `validateParams` accepts them (userId still accepted as `user.id` alias). Add validate tests: queue defaults to 'main'; skipCheckers must be string[] if present; user is optional object.
- [ ] **Step 2 — handle.ts.** Rewrite to:
  1. resolve `queueName = params.queue ?? 'main'`;
  2. `const { promos, persist } = await configService.getQueue(queueName)`;
  3. build `UserData` from `params.user` (id, authenticated ?? false, impressions ?? {}, lastShownAt ?? {}, age/region/subscriptionLevel — fall back to userService/billingService only for fields not provided; if `params.user` absent entirely, keep the old stub path for back-compat/tests);
  4. `const skip = [...(params.skipCheckers ?? []), ...(persist ? ['limit','cooldown'] : [])];`
  5. `const promo = selectPromo(promos, userData, { now }, skip);`
  6. return ok/skipped as today. Remove the `recordImpression` call (consumer records).
- [ ] **Step 3 — tests.** Update `handle.test.ts`: inject a fake `configService.getQueue`; assert persist queue skips limit/cooldown; assert `params.user.authenticated` gates an `audience:'authenticated'` promo; assert `params.user.impressions` drives `limit`.
- [ ] **Step 4 — run** `npm test` → all green; `npm run typecheck` → 0.
- [ ] **Step 5 — commit** `git commit -am "feat: /models select-promo accepts queue + skipCheckers + user context"`

---

## Phase B — promo-cabinet (`c:\Users\Yarrrr\Desktop\promo-cabinet`, branch `feat/cabinet-implementation`)

### Task B1: audience in schema (TDD)
**Files:** `src/lib/schema.ts`, `src/lib/schema.test.ts`
- [ ] Add `audience: z.enum(['all','authenticated','anonymous']).optional()` to `promoSchema`; test accepts a value + rejects garbage. Commit `feat: audience field in cabinet schema`.

### Task B2: named-queue store + keys + migration (TDD)
**Files:** `src/lib/s3.ts`, `src/lib/catalogue.ts`, `src/lib/schema.ts`, `src/lib/catalogue.test.ts`
- [ ] **Keys:** `queuesIndexKey()` → `${prefix}queues.json`; `queueKey(name)` → `${prefix}queue-${name}.json`. Remove the old single `queueKey()`.
- [ ] **Schema:** `queuesIndexSchema = z.array(z.object({ name: z.string().min(1), persist: z.boolean() }))`; `queueObjectSchema = z.object({ persist: z.boolean().default(false), ids: z.array(z.string().min(1)).default([]) })`.
- [ ] **Store (`catalogue.ts`):** `readPool/writePool` (unchanged); `readQueuesIndex()/writeQueuesIndex()`; `readQueue(name): {persist,ids}` / `writeQueue(name, obj)`; `mutateQueue(name, apply)`; `ensureMainQueue()` — if `queues.json` missing, migrate: read legacy `queue.json` (bare id array) → write `queue-main.json {persist:false, ids}` + `queues.json [{name:'main',persist:false}]`. `readState()` → `{ promos, queues: index }`.
- [ ] **Tests** (real S3, unique prefix): index round-trip; per-queue `{persist,ids}` round-trip; `mutateQueue`; migration creates `main` from legacy `queue.json`. Commit `feat: named-queue store (queues.json + queue-<name>.json) with main migration`.

### Task B3: queue mutations (TDD)
**Files:** `src/lib/mutations.ts`, `src/lib/mutations.test.ts`
- [ ] Reuse `enqueue/dequeue/reorderQueue` (operate on an `ids: string[]`). Add `removeFromAllQueues(index, readQ, writeQ, id)` helper concept handled in the route (see B4) — keep pure `enqueue/dequeue/reorderQueue` here; add tests if signatures change. Commit if changed.

### Task B4: API routes
**Files:** `src/app/api/queues/route.ts`, `src/app/api/queues/[name]/route.ts`, `src/app/api/queues/[name]/[id]/route.ts`, update `src/app/api/promos/route.ts` + `src/app/api/promos/[id]/route.ts`
- [ ] `GET /api/queues` → index; `POST /api/queues {name,persist}` → add to index + create empty `queue-<name>.json` (reject dup name); `PATCH /api/queues/[name] {persist?,rename?}`; `DELETE /api/queues/[name]` (remove index entry + delete object).
- [ ] `GET /api/queues/[name]` → `{persist, ids, promos}` (resolve ids→pool, skip dangling); `PUT /api/queues/[name] {ids}` → `mutateQueue(name, q => ({...q, ids: reorderQueue(q.ids, ids)}))`; `POST /api/queues/[name]/[id]` enqueue; `DELETE /api/queues/[name]/[id]` dequeue.
- [ ] `GET /api/promos` → `{ promos, queues }` (index) so the list can show membership. `DELETE /api/promos/[id]` (hard delete) → also dequeue from every queue in the index, then remove from pool. All routes keep `isAuthed`. Add/adjust route tests (real S3) covering create-queue, enqueue/dequeue/reorder, hard-delete-clears-all-queues. Commit `feat: named-queue API (CRUD + membership) + hard delete clears all queues`.

### Task B5: UI — Очереди page + audience select + membership badges
**Files:** `src/app/cabinet/queues/page.tsx` (+ a client `QueuesManager`), update `src/app/cabinet/queue/page.tsx` (redirect to /cabinet/queues or keep as `main`), `src/components/PromoForm.tsx`, `src/components/PromoList.tsx`, `src/components/CabinetNav.tsx`
- [ ] **Form:** add an **audience** select for all formats: `<select value={p.audience ?? 'all'}>` → options `all` («Все»), `authenticated` («Только залогиненные»), `anonymous` («Только гости»); `set({ audience })`; include in `sanitize` (always kept). 
- [ ] **Queues page** (`/cabinet/queues`): list queues (name + persist badge), create (name + persist toggle → `POST /api/queues`), open a queue → manage members (reorder ↑↓ via `PUT`, remove via `DELETE .../[id]`) + add-from-pool (`POST .../[id]`), toggle persist / delete queue. Reuse the existing `PromoQueue` ordering UI per queue.
- [ ] **Nav:** replace the single «Очередь» with «Очереди» (→ /cabinet/queues). **List page:** each card shows the queues it belongs to (compute from the index + per-queue reads, or a `GET /api/promos` that includes membership) + an «В очередь…» picker.
- [ ] Commit `feat: queues management UI + audience select`.

### Task B6: verify
- [ ] `npm test` (real S3) green; `npm run typecheck` 0; `npm run build` ok. No commit.

---

## Phase C — abkhaz-auto (`c:\Users\Yarrrr\Desktop\abkhaz-auto`, branch `main`; LOCAL ONLY, deploy separately)

> Next 16 — consult `node_modules/next/dist/docs/` before route/handler code.

### Task C1: Supabase migration `promo_impressions`
**Files:** `supabase/migrations/<ts>_promo_impressions.sql`
- [ ] SQL:
```sql
create table if not exists public.promo_impressions (
  user_id text not null,
  promo_id text not null,
  count integer not null default 0,
  last_shown_at timestamptz,
  primary key (user_id, promo_id)
);
```
(Apply via the project's migration flow / Supabase Studio. RLS: service-role used server-side; no public policy needed.)

### Task C2: impression helpers + userId resolution
**Files:** `src/lib/promo-impressions.ts`, `src/lib/promo-user.ts`
- [ ] `getPromoUser()` (server): returns `{ id, authenticated }` — Supabase session user id + `true` if logged in; else read/set `promo_uid` httpOnly cookie (uuid) and `authenticated:false`.
- [ ] `getImpressions(userId)` → `{ impressions: Record<string,number>, lastShownAt: Record<string,string> }` (select from `promo_impressions` via service-role client). `recordImpression(userId, promoId)` → upsert `count = promo_impressions.count + 1, last_shown_at = now()`.

### Task C3: getSelectedPromo({queue, skipCheckers}) + slots config
**Files:** `src/lib/promo.ts`, `src/lib/promo-slots.ts`
- [ ] `getSelectedPromo({ queue, skipCheckers })`: resolve user via `getPromoUser()`, `getImpressions`, build `params.user = { id, authenticated, impressions, lastShownAt }`, issue ticket, POST `/models` `{ models:['select-promo'], params:{ queue, skipCheckers, user } }`, return promo|null.
- [ ] `promo-slots.ts`: `export const PROMO_SLOTS = { topline: { queue: 'home-banner', skipCheckers: ['limit','cooldown'] }, overlay: { queue: 'home-popup', skipCheckers: [] } };` (extensible per page later).

### Task C4: components + seen endpoint
**Files:** `src/components/promo/ToplineSlot.tsx`, `src/components/promo/ClientPromo.tsx`, `src/app/api/promo/route.ts`, `src/app/api/promo/seen/route.ts`
- [ ] `ToplineSlot` (SSR): `getSelectedPromo(PROMO_SLOTS.topline)`; render if topline; record impression server-side (`recordImpression`).
- [ ] `/api/promo` (CSR proxy) → `getSelectedPromo(PROMO_SLOTS.overlay)` → `{promo}`. `ClientPromo` fetches it; on display (mount with a real ad) calls `POST /api/promo/seen { promoId }`.
- [ ] `POST /api/promo/seen` (runtime nodejs): resolve user → `recordImpression(userId, promoId)` → `{ok:true}`.
- [ ] **Step verify:** `npx tsc --noEmit` clean; `next build` (note: needs Supabase reachable / build args). Commit `feat: queue-aware promo slots + real impression read/record (Supabase)`.

---

## Phase D — deploy
- [ ] **S3 migration:** run/trigger `ensureMainQueue()` against the real bucket (via a cabinet admin hit or a one-off script) so `queues.json` + `queue-main.json` exist; create example queues `home-banner` (persist) and `home-popup` (normal) via the cabinet, and place the topline + a popup promo into them.
- [ ] **Redeploy** BFF + admin to marnero (rsync + `npm install`/build + restart); abkhaz-auto to apsoft (home-copy `~/promo-deploy`: re-ship, `docker compose up -d --build`). Renderer republish NOT needed (no renderable field changed).
- [ ] **Verify:** persist banner shows regardless of impression count; popup respects limit/cooldown after recorded shows; `audience` filters logged-in vs guest; BFF logs show queue-named requests.

## Done
Pages pull **named queues** by name; the BFF skips checkers per `skipCheckers` (+ auto-skips frequency for `persist` queues), honours **audience**, and uses **real impressions** from abkhaz-auto's Supabase so frequency/cooldown finally work.
