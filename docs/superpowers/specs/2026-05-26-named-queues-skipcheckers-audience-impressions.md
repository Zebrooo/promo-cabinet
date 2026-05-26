# Named queues · skipCheckers · audience targeting · real impression storage — Design

**Date:** 2026-05-26
**Repos:** `abhPromo` (BFF/selector), `promo-cabinet` (admin), `abkhaz-auto` (consumer), `@zebrooo/promo-renderer` (only if a field needs rendering — none here)

## Goal

Make promo selection multi-queue and condition-aware:
1. **Named, dynamic queues** on S3 — pages pull different queues (some "persist"/always-on, some normal). The BFF resolves a queue by **name**, joins with the pool, and runs selection.
2. **`skipCheckers`** request param — skip named checkers for a request (e.g. a persist banner skips frequency but still checks date/targeting/audience).
3. **Audience targeting** — show a promo to all / only authenticated / only anonymous users; configurable in the cabinet.
4. **Real impression storage** so frequency (`limit`) and `cooldown` actually work — currently the BFF's user service is a stub and nothing records shows.

## Decisions (agreed)

- **Named queues**, dynamic. Registry `queues.json` + per-queue `queue-<name>.json = { persist, ids }`. A promo may belong to several queues. Migrate the current single `queue.json` → `queue-main.json`.
- **Impression storage = Supabase (Postgres) in abkhaz-auto** (table `promo_impressions`). The BFF stays storage-free: the consumer (abkhaz-auto) reads the user's impressions and passes them in the request; records shows after display.
- **skipCheckers** is the request mechanism; additionally, a queue with `persist:true` auto-skips the frequency checkers (`limit`,`cooldown`) server-side.
- **User context provided by the consumer** in `params.user`.

## S3 model

- `promos.json` — pool of all promos (unchanged).
- **`queues.json`** — `[{ name: string, persist: boolean }]`. Lets the cabinet enumerate queues.
- **`queue-<name>.json`** — `{ persist: boolean, ids: string[] }` (ordered promo ids = priority).
- Migration: rename current `queue.json` → `queue-main.json` (`{ persist:false, ids:<current> }`) and seed `queues.json` with `[{name:"main",persist:false}]`. (One-time migration script; or the cabinet/BFF treat a missing `queue-main.json` by falling back to `queue.json` during transition.)
- Keys via `s3.ts`: add `queuesIndexKey()` (`queues.json`) and `queueKey(name)` (`queue-${name}.json`). Plain PUT (last-write-wins), as today.

## BFF (`abhPromo`)

### Request params (`/models` select-promo)
- `params.queue: string` (required) — queue name.
- `params.skipCheckers?: string[]` — checker names to skip.
- `params.user?: { id?: string; authenticated?: boolean; impressions?: Record<string,number>; lastShownAt?: Record<string,string>; age?: number; region?: string; subscriptionLevel?: SubscriptionLevel }` — user context from the consumer. When present it is used directly; when absent the stub userService/billingService fallback is used (keeps tests working). `params.userId` stays accepted as an alias for `params.user.id`.

### Selection flow (`config-service` + `select-promo/handle`)
- Read `queue-<name>.json` (`{persist, ids}`; missing → `{persist:false, ids:[]}`) + `promos.json` (pool); join ids→promos in order, skipping dangling ids → ordered candidate list.
- Build the effective skip set = `params.skipCheckers ∪ (queue.persist ? ['limit','cooldown'] : [])`.
- Run `selectPromo(candidates, userData, { now }, checkers)` where `checkers` is the named-checker list minus the skip set.

### Named checkers (`promo-selector`)
- Convert `defaultCheckers` to named entries: `date`, `targeting` (was `userChecker`: age/region/subscription), `audience` (NEW), `limit`, `cooldown`.
- `selectPromo` accepts an optional `skip: string[]` and filters named checkers by name (a checker whose name is in `skip` is not run). Default = run all.
- **`audience` checker:** pass if `promo.audience` is unset or `'all'`; if `'authenticated'` require `userData.authenticated === true`; if `'anonymous'` require `userData.authenticated !== true`.
- `UserData` gains `authenticated: boolean` (default false).

### handle.ts
- Prefer `params.user` for `UserData` (id, authenticated, impressions, lastShownAt, age, region, subscriptionLevel); fall back to userService/billingService for any missing field. `impressionCounts`/`lastShownAt` come from `params.user` (the real data), not the stub.
- After selection, the BFF does NOT record impressions (the consumer owns storage). Drop/skip the stub `recordImpression`.

### abhPromo schema (`catalogue-schema.ts`) + `Promo` type
- Add `audience: z.enum(['all','authenticated','anonymous']).optional()` (+ `audience?: 'all'|'authenticated'|'anonymous'` on the `Promo` type).

## promo-cabinet (admin)

### Schema (`schema.ts`)
- Add `audience` enum (optional) to `promoSchema`.

### Storage (`catalogue.ts`) + keys (`s3.ts`)
- `queuesIndexKey()` + `queueKey(name)`. Functions: `readQueuesIndex()/writeQueuesIndex()`, `readQueue(name): {persist, ids}` / `writeQueue(name, {persist, ids})`, `mutateQueue(name, apply)`. `readState()` for a page returns `{ promos, queues: index }` and per-queue reads on demand.
- Migration helper / on first run: if `queues.json` missing, create from existing `queue.json` as `main`.

### API routes
- `GET /api/queues` → index `[{name,persist}]`.
- `POST /api/queues` `{name, persist}` → create queue (empty) + add to index. `PATCH/DELETE /api/queues/[name]` → rename/toggle persist / delete.
- `GET /api/queues/[name]` → `{persist, ids, promos}` (resolved). `PUT /api/queues/[name]` `{ids}` → reorder (permutation). `POST /api/queues/[name]/[id]` enqueue, `DELETE /api/queues/[name]/[id]` dequeue.
- Keep `GET /api/promos` (pool + per-promo queue membership badges computed from all queues).
- `DELETE /api/promos/[id]` (hard delete) also removes the id from every queue.

### UI
- **«Очереди»** page: list queues (name + persist badge), create queue (name + persist toggle), open a queue to manage membership + order (reorder ↑↓, remove); delete/rename queue.
- **«Все промо»**: each card shows which queues it's in + an «В очередь…» action (pick a queue). Hard delete unchanged (now clears all queues).
- **Form**: add **audience** select (`all` / только залогиненные / только гости) for all formats.

## abkhaz-auto (consumer)

### Supabase
- Migration `promo_impressions (user_id text, promo_id text, count int not null default 0, last_shown_at timestamptz, primary key (user_id, promo_id))` (in `supabase/migrations`).
- Helpers (`src/lib/promo.ts` or new `src/lib/promo-impressions.ts`): `getImpressions(userId)` → `{impressions: Record<promoId,count>, lastShownAt: Record<promoId,iso>}`; `recordImpression(userId, promoId)` → upsert `count = count+1, last_shown_at = now()`.

### User identity
- `userId`: logged-in → Supabase user id (from session); anonymous → a stable id stored in an `httpOnly` cookie (`promo_uid`), generated on first request. `authenticated` = whether a Supabase session exists.

### Fetch flow (`getSelectedPromo`)
- Signature `getSelectedPromo({ queue, skipCheckers })`. Builds `params.user` = `{ id: userId, authenticated, impressions, lastShownAt }` (from Supabase), issues the TVM ticket, POSTs `/models` with `{ models:['select-promo'], params:{ queue, skipCheckers, user } }`.
- Per-page config (`src/lib/promo-slots.ts`): map of slot → `{ queue, skipCheckers, render: 'ssr'|'csr' }`. Homepage example: `{ queue:'home-banner', skipCheckers:['limit','cooldown'], render:'ssr' }` (topline) + `{ queue:'home-popup', skipCheckers:[], render:'csr' }`.

### Components
- `ToplineSlot` → SSR persist flow (queue from config). Records the impression server-side on render (persist counts are informational; recording still happens for analytics).
- `ClientPromo` → CSR main flow; on actual display calls `POST /api/promo/seen { promoId }` → `recordImpression`.
- New route `POST /api/promo/seen` (node runtime) → resolves userId from cookie/session → `recordImpression`.

## Testing / gates

- **abhPromo:** unit tests for named-checker skip, `audience` checker, queue-by-name join (incl. persist auto-skip); `npm test` green; `npm run typecheck` 0.
- **promo-cabinet:** queue index + per-queue store mutations (real S3, unique prefix), audience schema, route tests; `npm test` green; typecheck 0; `next build` ok.
- **abkhaz-auto:** typecheck/build; manual: persist banner always shows (frequency skipped), popup respects limit/cooldown after recorded shows, audience filters logged-in vs guest.

## Migration & rollout

- Provide a one-time migration: `queue.json` → `queue-main.json` + `queues.json`. The BFF currently reads `queue.json`; after rollout it reads `queue-<name>.json`. Deploy BFF + admin (marnero) and abkhaz-auto (apsoft, home-copy) as before; republish renderer only if a renderable field changes (none here).

## Out of scope

- Atomic impression increment under high concurrency (Postgres upsert is good enough; no distributed lock).
- Per-queue scheduling beyond membership/order + persist.
- A/B weighting within a queue (first-match-wins stays).
