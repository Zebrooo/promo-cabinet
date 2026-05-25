# Design: Promo Cabinet + S3 catalogue (ordered queue)

- **Date:** 2026-05-25
- **Status:** Approved (ready for implementation plan)
- **Related:** `abhPromo` (Promozavr selection backend), `promo-renderer` (display package)

## Goal

An internal admin **cabinet** to author promos as an **ordered queue** and store them on
S3, plus switching the **`abhPromo`** backend to read that queue from S3 (instead of a
hardcoded array) and select the **first promo in queue order** that is eligible for the
user. The operator sets both the queue order and each promo's per-user show conditions
(targeting, dates, impression limit, cooldown). The render half (`promo-renderer`) is
unchanged and out of scope.

End-to-end picture (only A + C are built here):
```
[A. promo-cabinet (Next.js)] --CRUD + reorder, auth--> operator
        │ server API routes (hold S3 write creds), read-modify-write
        ▼
[B. S3 bucket]  catalogue.json  =  ORDERED Promo[]  (array index = queue position)
        ▲ GetObject (read-only)
        │
[C. abhPromo backend = OUR BFF]  config-service reads the ordered catalogue from S3;
        │  POST /models → select-promo aggregates UserData from its services
        │  (userService is DataSync-backed → impressionCounts + lastShownAt),
        │  walks the queue top→bottom, returns the FIRST eligible promo
        ▼
[D. existing chain, NOT built]  client calls abhPromo → renders via promo-renderer
```

## Decisions (locked)

1. **S3 is real** — integrate `@aws-sdk/client-s3` now; mock the SDK in tests.
   **The bucket itself is provisioned later by the user** — we do NOT create/configure
   a bucket as part of this work. Bucket name/region/creds come from env; until they
   exist, dev relies on mocked tests.
2. **Cabinet = separate Next.js fullstack service** (App Router): UI + server API routes.
   Holds S3 write creds and the admin password server-side.
3. **Auth = shared login/password** from env + signed httpOnly cookie session. No
   multi-user/roles/OAuth.
4. **Images = `imageUrl` string field only.** No file upload to S3.
5. **Cabinet has full CRUD + reorder.** No preview — relevance selection is abhPromo's job.
6. **The queue is the array order of a single `catalogue.json`** (`Promo[]`). Position in
   the array = position in the queue; the operator reorders it explicitly. One file = one
   GET for abhPromo's read-heavy path.
7. **Selection = first eligible in queue order.** abhPromo walks the catalogue top→bottom
   and returns the first promo that passes every checker. **No scoring** — `baseScore`,
   `ScoreChecker`, `minScore`, and `checker-config.json` are removed.
8. **Frequency = total cap + cooldown, both per-user.** `maxImpressionsPerUser` (total
   cap, 0 = unlimited) plus `cooldownHours` (minimum hours between two shows to the same
   user, 0 = no cooldown). Both are fields on each promo.
9. **abhPromo IS our BFF** (there is no separate BFF service). It reads fresh per request,
   no cache, and aggregates `UserData` from its own services. Per-user show data
   (`impressionCounts`, `lastShownAt`) comes from `userService`, which is backed by a
   per-user **DataSync** key/value store (`promoId → timestamp`). The DataSync store
   itself is out of scope; wiring `lastShownAt` into the user profile + `UserData` is in
   scope.

## Out of scope (YAGNI)

S3 bucket provisioning; image upload to S3; multi-user / roles / OAuth; promo versioning /
audit history; caching the catalogue in abhPromo; A/B testing; any preview/"will it show"
feature inside the cabinet; the DataSync store itself; a separate BFF service (abhPromo IS
the BFF); changing `promo-renderer`.

## Shared domain type (`Promo`)

The cabinet authors, and the catalogue stores, the full `Promo` shape that abhPromo
defines (`abhPromo/src/promo-selector/types.ts`). The cabinet **mirrors** this type
(separate repo) and treats its zod schema as the validation source of truth. **Array
order in `catalogue.json` is the queue order — there is no `order` field on the promo.**

```ts
type SubscriptionLevel = 'none' | 'plus' | 'premium';
type PromoFormat = 'inline' | 'popup' | 'fullscreen';

interface Promo {
  id: string;            // slug, unique within the catalogue
  name: string;          // internal admin label
  startsAt: string;      // ISO-8601
  endsAt: string;        // ISO-8601
  targeting: {
    minAge?: number;
    maxAge?: number;
    regions?: string[];
    subscriptionLevels?: SubscriptionLevel[];
  };
  maxImpressionsPerUser: number;  // 0 = unlimited
  cooldownHours: number;          // 0 = no cooldown; min hours between two shows to a user
  format: PromoFormat;
  title: string;
  description?: string;
  imageUrl?: string;
  action?: { href: string; label?: string };
  dismissible?: boolean;
}
```

## B. S3 layout

- Object key (optional `PROMO_KEY_PREFIX` env, default none):
  - `catalogue.json` → **ordered** `Promo[]`
- Content-Type `application/json`. Private object (read via SDK, not public URLs).
- `checker-config.json` is **removed** (scoring is gone).

## A. Cabinet (`promo-cabinet`, Next.js App Router + TypeScript)

### Auth
- `/login` page → `POST /api/login` compares to `ADMIN_USER` / `ADMIN_PASSWORD` (env);
  on success sets a signed httpOnly session cookie (signed with `SESSION_SECRET`).
- `middleware.ts` gates everything under `/cabinet` and `/api/*` except `/api/login`;
  unauthenticated → redirect to `/login` (pages) or `401` (api).
- `POST /api/logout` clears the cookie.

### Pages
- `/login` — credentials form.
- `/cabinet` — the queue: an **ordered** table of promos (queue position, title, format,
  active-by-date badge, maxImpressionsPerUser, cooldownHours) with Move up / Move down,
  Create / Edit / Delete actions.
- `/cabinet/new` — create form (new promo is appended to the end of the queue).
- `/cabinet/[id]` — edit form (pre-filled).
- Delete = confirm dialog → `DELETE`.

### Promo form
All `Promo` fields above. Client + server validation via a shared **zod** schema:
`id` non-empty slug; `format` ∈ enum; `title`, `name` non-empty; `startsAt`/`endsAt`
valid ISO and `startsAt < endsAt`; `maxImpressionsPerUser` integer ≥ 0; `cooldownHours`
integer ≥ 0; `action.href` required if any action field present; targeting arrays optional.

### API routes (server-side; hold S3 creds)
- `GET /api/promos` → read `catalogue.json`, return the ordered `Promo[]` (+ current ETag
  for edit/reorder flows).
- `POST /api/promos` → validate; reject if `id` already exists (`409`); RMW-append to the
  end of the queue.
- `PUT /api/promos/[id]` → validate; replace by id in place, preserving queue position
  (`404` if missing); RMW.
- `DELETE /api/promos/[id]` → remove by id (`404` if missing); RMW.
- `PUT /api/promos/reorder` → body = full ordered list of ids; validate it is a permutation
  of the current ids (`400` otherwise); reorder the array; RMW.

### S3 write helper (RMW + optimistic concurrency)
`readCatalogue()` → `{ promos, etag }` via GetObject. `writeCatalogue(promos, etag)` →
PutObject with `IfMatch: etag`. On `PreconditionFailed (412)` re-read and re-apply the
mutation up to 3 times; if still conflicting, the route returns `409`. (Single-admin tool,
so conflicts are rare; this just prevents two-tab lost updates — same class of problem as
the LimitChecker race, solved the "right" way here because S3 gives us a cheap conditional
write.)

### Styling
Minimal, function-first (plain CSS modules or Tailwind — not a design exercise).

## C. abhPromo change — read the ordered catalogue from S3, select first eligible

### Reads from S3
- Add `@aws-sdk/client-s3`. New `src/services/s3-client.ts` constructs the S3 client
  from env.
- `config-service.ts`:
  - `getPromos()` → GetObject `catalogue.json` → text → JSON.parse → **zod-validate** to
    the ordered `Promo[]` → return (order preserved). Wrapped in existing `withTimeout`.
  - Remove `getCheckerConfig()` and `MOCK_PROMOS`. The `ConfigService` interface becomes
    `{ getPromos(): Promise<Promo[]> }`.
- Failure handling: S3 error, missing object, or schema-invalid JSON → throw. `handle.ts`
  already maps a `getPromos` throw to `status:"error"` (`config_service_unavailable`).
  (Defensive parsing means a corrupt catalogue degrades to `error`, never a crash.)
- Env: `PROMO_BUCKET`, `AWS_REGION`, optional `PROMO_KEY_PREFIX`; AWS creds via the
  standard SDK chain. Add these to `src/config.ts`. Remove any `minScore` config.

### Selection logic (`promo-selector`) — abhPromo IS the BFF
The queue walk + checker evaluation lives in abhPromo (`select-promo`); abhPromo is "our
BFF". There is no separate BFF service.

- **Remove** `ScoreChecker`, `baseScore`, `minScore`, `scoreMultiplier`, and the
  `checker-config.json` read.
- `CheckerConfig` becomes `{ now: Date }` (just the evaluation clock).
- `UserData` gains `lastShownAt: Record<string, string>` (promoId → ISO timestamp,
  defaults to `{}`) alongside the existing `impressionCounts`. `scoreMultiplier` removed.
- **Checkers return a plain `boolean`** (not `{ ok, reason }`). The `Checker` type becomes
  `(userData, promo, config) => boolean`; the `CheckResult` type and the per-rejection
  `reason`/`rejected` tracking are removed (simpler contract: true = pass, false = skip).
- New **`CooldownChecker`**: returns `true` iff `cooldownHours === 0` OR there is no
  `lastShownAt[promo.id]` OR `now - lastShownAt[promo.id] >= cooldownHours`.
- **Checkers live in an array**, evaluated in order, each cheap→expensive:
  `[DateChecker, UserChecker (targeting), LimitChecker (maxImpressionsPerUser),
  CooldownChecker]`. Adding/reordering a rule = editing this array.
- **The algorithm:** walk the catalogue **in queue (array) order**; for each promo iterate
  the checker array — if a checker returns `false`, skip this promo and move to the next;
  if **all** checkers return `true`, this promo is shown (return it, short-circuit). If no
  promo passes, show **nothing** (return `null` / empty result). (`.every()` keeps the
  evaluation lazy so later checkers don't run once one fails.)

### `handleSelectPromo` + `userService` wiring
- Drop the `configService.getCheckerConfig()` call; load only `getPromos()`.
- `userService.getUserProfile()` (DataSync-backed) returns `lastShownAt: Record<string,
  string>` and `impressionCounts`; it no longer returns `scoreMultiplier`.
- Build `UserData` with `lastShownAt` from the profile; call `selectPromo(promos,
  userData, { now })`.
- Remove the `rejected`-reasons logging (checkers no longer return reasons). A
  no-match still yields `{ status: 'skipped', reason: 'no_promo' }`. `recordImpression`
  on a chosen promo is unchanged.

### Seed script
`scripts/seed-catalogue.ts` uploads an initial ordered `catalogue.json` (the three former
mock promos, now with `cooldownHours` instead of `baseScore`, in a sensible queue order).
No `checker-config.json`. Run manually; not part of the server.

## Env summary

- **promo-cabinet:** `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `AWS_REGION`,
  `PROMO_BUCKET`, optional `PROMO_KEY_PREFIX`, AWS creds. `.env.local` (gitignored).
- **abhPromo:** `PROMO_BUCKET`, `AWS_REGION`, optional `PROMO_KEY_PREFIX`, AWS creds.

## Testing

- **abhPromo:** mock `@aws-sdk/client-s3` (e.g. `aws-sdk-client-mock`). config-service
  tests: valid catalogue parses to an ordered `Promo[]`; malformed JSON → throws;
  schema-invalid → throws; S3 error → throws. Selector tests: first-eligible-in-order
  wins (a higher promo that fails a checker is skipped for a lower one that passes);
  `CooldownChecker` (within cooldown → skip, past cooldown → eligible, `cooldownHours:0`
  → always eligible, no `lastShownAt` entry → eligible). Existing handle/server tests
  inject a fake `configService` and are updated for the new interface/return.
- **promo-cabinet:** route handlers tested as functions with a mocked S3 layer — CRUD
  correctness on the ordered array; append goes to the end; edit preserves position;
  reorder validates the id permutation (`400` on mismatch) and rewrites order; zod rejects
  invalid promos (`400`); duplicate id (`409`); missing id (`404`); ETag conflict path
  (`409`). Auth: request without a valid session → `401`/redirect. Form-level validation
  test for the zod schema.
- TDD throughout (Vitest).

## Notes / assumptions

- Bucket provisioning, IAM, and CDN are the user's later step; this work is complete and
  testable without a live bucket (SDK mocked).
- The cabinet and abhPromo are separate repos/services that agree only on the JSON shape
  of `catalogue.json` and the `Promo` type (mirrored, not shared as a package — a shared
  types package is a possible later refactor).
- Cooldown correctness depends on the BFF supplying accurate `lastShownAt` from DataSync;
  abhPromo trusts the input and stays stateless.
