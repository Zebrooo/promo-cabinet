# Queue/Pool split — Design

**Date:** 2026-05-26
**Repos:** `promo-cabinet` (cabinet), `abhPromo` (selector service)

## Goal

Split promo storage on S3 into two objects: a **pool** of all promos and an ordered
**queue** of active promo IDs. The cabinet can remove a promo from the queue without
deleting it (reversible), re-add it, and separately delete it permanently. The abhPromo
selector serves only the queued promos, in queue order.

## Decisions (agreed with the user)

1. **Storage model:** two S3 objects — `promos.json` (the pool: all `Promo` objects) and
   `queue.json` (ordered array of promo `id` strings = priority order of active promos).
2. **Create → pool only.** A newly created promo goes into `promos.json` but NOT into the
   queue; it is added to the queue later via an explicit "В очередь" action.
3. **Remove from queue is reversible** (drop the id from `queue.json`; the promo stays in the
   pool) and there is a **separate hard delete** (remove from both objects, with confirmation).
4. **Fresh start:** `promos.json`/`queue.json` begin empty. The legacy `catalogue.json` is no
   longer read or written (it may remain in the bucket as dead data). No migration.
5. **abhPromo hard-switches** to the new model — no `catalogue.json` fallback.

## S3 model

- Key `${PROMO_KEY_PREFIX}promos.json` → JSON array of `Promo` (validated by `poolSchema`,
  which equals the existing array-of-promos schema).
- Key `${PROMO_KEY_PREFIX}queue.json` → JSON array of `string` ids (validated by `queueSchema
  = z.array(z.string())`).
- A missing object reads as an empty array (same `isNoSuchKey` handling as today).
- Writes are plain unconditional PUTs (last-write-wins) — the bucket.ru backend has no
  conditional writes. This is unchanged from the current catalogue.

## abhPromo (selector service)

- `s3-client.ts`: replace `catalogueKey()` with `promosKey()` and `queueKey()`.
- `catalogue-schema.ts`: keep `promoSchema`; expose `poolSchema` (array of promos) and add
  `queueSchema = z.array(z.string())`.
- `config-service.ts`: `getPromos()` now reads **both** objects and joins:
  read `queue.json` (ordered ids) + `promos.json` (pool, indexed by id), map each queued id to
  its pool promo, **skipping ids with no matching promo** (dangling ids). Returns the ordered
  `Promo[]` of queued promos. The downstream `selectPromo(promos, …)` is unchanged — it still
  receives an ordered promo list and picks the first match.
- `scripts/seed-catalogue.ts`: write both `promos.json` (the seed promos) and `queue.json`
  (their ids, in seed order).
- `config-service.test.ts`: rewritten to seed `promos.json` + `queue.json` and assert: queued
  promos returned in queue order; a pool promo not in the queue is excluded; a queued id with
  no pool promo is skipped (no throw).

## promo-cabinet

### Storage layer (`src/lib/s3.ts`, `src/lib/catalogue.ts`)
- `s3.ts`: add `promosKey()` and `queueKey()`; remove `catalogueKey()`.
- `catalogue.ts` becomes the two-object store:
  - `readPool(): Promise<Promo[]>` / `writePool(promos): Promise<void>`
  - `readQueue(): Promise<string[]>` / `writeQueue(ids): Promise<void>`
  - `mutatePool(apply: (promos: Promo[]) => Promo[]): Promise<Promo[]>`
  - `mutateQueue(apply: (ids: string[]) => string[]): Promise<string[]>`
  - `readState(): Promise<{ promos: Promo[]; queue: string[] }>` for pages.

### Mutations (`src/lib/mutations.ts`)
- `addPromo(pool, promo)` — append to pool; throw `DuplicateIdError` if id exists. (Does NOT
  touch the queue.)
- `updatePromo(pool, id, next)` — replace in pool; throw `NotFoundError` if missing.
- `removePromo(pool, id)` — remove from pool; throw `NotFoundError` if missing.
- `enqueue(queue, id)` — append id to the queue if not already present (idempotent).
- `dequeue(queue, id)` — remove id from the queue (idempotent).
- `reorderQueue(queue, ids)` — reorder; `ids` must be a permutation of the current queue, else
  throw `ReorderMismatchError`.

### API routes
| Method + path | Action |
|---|---|
| `GET /api/promos` | returns `{ promos, queue }` (pool + ordered queue ids) |
| `POST /api/promos` | create → `mutatePool(addPromo)` (pool only) |
| `PUT /api/promos/[id]` | edit → `mutatePool(updatePromo)` |
| `DELETE /api/promos/[id]` | hard delete → `mutateQueue(dequeue)` **then** `mutatePool(removePromo)` |
| `POST /api/promos/[id]/queue` | enqueue → `mutateQueue(enqueue)` |
| `DELETE /api/promos/[id]/queue` | dequeue → `mutateQueue(dequeue)` |
| `PUT /api/queue` | reorder → `mutateQueue(reorderQueue)` with body `{ ids: string[] }` |

All routes keep the existing auth guard. Hard delete writes the queue first then the pool, so
there is never a queued id pointing at a missing promo (and abhPromo skips dangling ids anyway).

### UI
- **Все промо** (`/cabinet`, list page): render every pool promo as a card. Each card shows a
  status badge — **в очереди** vs **в пуле** (computed from the queue id set). Pool-only cards
  get a **«В очередь»** button (`POST /api/promos/[id]/queue`). Every card gets **«Удалить
  совсем»** (a `window.confirm()` then `DELETE /api/promos/[id]`). The edit link stays.
  Empty-state text updated (creation no longer auto-queues): e.g. "Промо пока нет. Создайте
  первое — оно появится здесь; добавьте его в очередь, чтобы показывать."
- **Очередь** (`/cabinet/queue`, queue page): render only queued promos, in order (resolve ids
  → pool). Keep up/down reorder, now posting to `PUT /api/queue`. Each row gets **«Убрать из
  очереди»** (`DELETE /api/promos/[id]/queue`). Empty-state: "Очередь пуста — добавьте промо из
  списка."

### Schema (`src/lib/schema.ts`)
- Keep `promoSchema`/`Promo`. Add `queueSchema = z.array(z.string())` and `poolSchema`
  (alias of the existing array-of-promos `catalogueSchema`). Keep `topline` in the format enum.

## Consistency notes

Two-object, last-write-wins storage means a hard delete is two PUTs (queue, then pool). If the
second fails, a promo could linger in the pool while gone from the queue — harmless (it's just
an un-queued pool promo). A dangling queue id (in queue, not in pool) is tolerated everywhere:
the cabinet queue page skips ids it can't resolve, and abhPromo skips them in the join.

## Testing / gates

- **abhPromo:** `npm test` green incl. the rewritten config-service join test; `npm run
  typecheck` 0.
- **promo-cabinet:** `npm test` green — new store + mutations unit tests, route tests against
  the real bucket (unique key prefix per test + cleanup), `queueSchema` test; `npm run
  typecheck` 0; `npm run build` succeeds.

## Out of scope

- Migrating the legacy `catalogue.json` (fresh start by decision).
- A fancy delete-confirmation modal (plain `window.confirm()`).
- Per-promo scheduling/activation beyond queue membership.
