# Design: Promo Cabinet + S3 catalogue

- **Date:** 2026-05-25
- **Status:** Approved (ready for implementation plan)
- **Related:** `abhPromo` (Promozavr selection backend), `promo-renderer` (display package)

## Goal

An internal admin **cabinet** to author promos and store them on S3, plus switching
the **`abhPromo`** backend to read the promo catalogue from that same S3 instead of a
hardcoded array. The existing selection + render chain (abhPromo `select-promo` →
`promo-renderer`) is unchanged and out of scope.

End-to-end picture (only A + C are built here):
```
[A. promo-cabinet (Next.js)] --CRUD, auth--> operator
        │ server API routes (hold S3 write creds), read-modify-write
        ▼
[B. S3 bucket]  catalogue.json (Promo[])  +  checker-config.json ({minScore})
        ▲ GetObject (read-only)
        │
[C. abhPromo backend]  config-service reads catalogue from S3 (replaces MOCK_PROMOS)
        │  POST /models → select-promo → chosen Advertisement
        ▼
[D. existing chain, NOT built]  BFF calls abhPromo → frontend renders via promo-renderer
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
5. **Cabinet has full CRUD** (list / create / edit / delete). **No preview** — relevance
   selection is abhPromo's job, not the cabinet's.
6. **S3 data model = a single `catalogue.json`** (`Promo[]`) + `checker-config.json`
   (`{ minScore }`). Single file = one GET for abhPromo's read-heavy path.
7. **Writes = read-modify-write with optimistic concurrency** via S3 conditional
   PutObject (`If-Match: <ETag>`); on `412 Precondition Failed` reload + retry, then
   surface `409` to the client if it still conflicts.
8. **abhPromo reads fresh per request, no cache** — consistent with the project's
   "no caching for load" ethos; a few RPS over S3 is fine and edits take effect
   immediately.

## Out of scope (YAGNI)

S3 bucket provisioning; image upload to S3; multi-user / roles / OAuth; promo
versioning / audit history; caching the catalogue in abhPromo; A/B testing; any
preview/"will it show" feature inside the cabinet; changing the selection chain or
`promo-renderer`.

## Shared domain type (`Promo`)

The cabinet authors, and the catalogue stores, the full `Promo` shape that abhPromo
already defines (`abhPromo/src/promo-selector/types.ts`). The cabinet **mirrors** this
type (separate repo) and treats its zod schema as the validation source of truth:

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
  baseScore: number;
  format: PromoFormat;
  title: string;
  description?: string;
  imageUrl?: string;
  action?: { href: string; label?: string };
  dismissible?: boolean;
}
```

## B. S3 layout

- Object keys (optional `PROMO_KEY_PREFIX` env, default none):
  - `catalogue.json` → `Promo[]`
  - `checker-config.json` → `{ "minScore": number }`
- Content-Type `application/json`. Private objects (read via SDK, not public URLs).

## A. Cabinet (`promo-cabinet`, Next.js App Router + TypeScript)

### Auth
- `/login` page → `POST /api/login` compares to `ADMIN_USER` / `ADMIN_PASSWORD` (env);
  on success sets a signed httpOnly session cookie (signed with `SESSION_SECRET`).
- `middleware.ts` gates everything under `/cabinet` and `/api/*` except `/api/login`;
  unauthenticated → redirect to `/login` (pages) or `401` (api).
- `POST /api/logout` clears the cookie.

### Pages
- `/login` — credentials form.
- `/cabinet` — table of promos (title, format, active-by-date badge, baseScore,
  maxImpressionsPerUser) with Create / Edit / Delete actions.
- `/cabinet/new` — create form.
- `/cabinet/[id]` — edit form (pre-filled).
- Delete = confirm dialog → `DELETE`.

### Promo form
All `Promo` fields above. Client + server validation via a shared **zod** schema:
`id` non-empty slug; `format` ∈ enum; `title`, `name` non-empty; `startsAt`/`endsAt`
valid ISO and `startsAt < endsAt`; `baseScore` ≥ 0; `maxImpressionsPerUser` integer ≥ 0;
`action.href` required if any action field present; targeting arrays optional.

### API routes (server-side; hold S3 creds)
- `GET /api/promos` → read `catalogue.json`, return `Promo[]` (+ current ETag for edit flows).
- `POST /api/promos` → validate; reject if `id` already exists (`409`); RMW-append.
- `PUT /api/promos/[id]` → validate; replace by id (`404` if missing); RMW.
- `DELETE /api/promos/[id]` → remove by id (`404` if missing); RMW.
- `GET /api/checker-config` → `{ minScore }`.
- `PUT /api/checker-config` → validate `{ minScore: number ≥ 0 }`; write.

### S3 write helper (RMW + optimistic concurrency)
`readCatalogue()` → `{ promos, etag }` via GetObject. `writeCatalogue(promos, etag)` →
PutObject with `IfMatch: etag`. On `PreconditionFailed (412)` re-read and re-apply the
mutation up to 3 times; if still conflicting, the route returns `409`. Same pattern for
`checker-config.json`. (Single-admin tool, so conflicts are rare; this just prevents
two-tab lost updates — same class of problem as the LimitChecker race, solved the
"right" way here because S3 gives us a cheap conditional write.)

### Styling
Minimal, function-first (plain CSS modules or Tailwind — not a design exercise).

## C. abhPromo change — read catalogue from S3

- Add `@aws-sdk/client-s3`. New `src/services/s3-client.ts` constructs the S3 client
  from env.
- `config-service.ts`:
  - `getPromos()` → GetObject `catalogue.json` → text → JSON.parse → **zod-validate**
    to `Promo[]` → return. Wrapped in existing `withTimeout`.
  - `getCheckerConfig()` → GetObject `checker-config.json` → validate `{ minScore }`.
  - Remove `MOCK_PROMOS`.
- Failure handling: S3 error, missing object, or schema-invalid JSON → throw. `handle.ts`
  already maps a `getPromos`/`getCheckerConfig` throw to `status:"error"`
  (`config_service_unavailable`) — no change needed there. (Defensive parsing means a
  corrupt catalogue degrades to `error`, never a crash.)
- Env: `PROMO_BUCKET`, `AWS_REGION`, optional `PROMO_KEY_PREFIX`; AWS creds via the
  standard SDK chain (env / shared config / role). Add these to `src/config.ts`.
- **Seed script** (`scripts/seed-catalogue.ts`): uploads the current three mock promos
  as the initial `catalogue.json` and `{ minScore: 50 }` as `checker-config.json`, so
  there is data once a bucket exists. Run manually; not part of the server.

## Env summary

- **promo-cabinet:** `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `AWS_REGION`,
  `PROMO_BUCKET`, optional `PROMO_KEY_PREFIX`, AWS creds. `.env.local` (gitignored).
- **abhPromo:** `PROMO_BUCKET`, `AWS_REGION`, optional `PROMO_KEY_PREFIX`, AWS creds.

## Testing

- **abhPromo:** mock `@aws-sdk/client-s3` (e.g. `aws-sdk-client-mock`). config-service
  tests: valid catalogue parses to `Promo[]`; `getCheckerConfig` parses; malformed JSON
  → throws; schema-invalid → throws; S3 error → throws. Existing handle/server tests
  inject a fake `configService` and are unaffected.
- **promo-cabinet:** route handlers tested as functions with a mocked S3 layer —
  CRUD correctness on the catalogue array; zod rejects invalid promos (`400`); duplicate
  id (`409`); missing id (`404`); ETag conflict path (`409`). Auth: request without a
  valid session → `401`/redirect. Form-level validation test for the zod schema.
- TDD throughout (Vitest).

## Notes / assumptions

- Bucket provisioning, IAM, and CDN are the user's later step; this work is complete and
  testable without a live bucket (SDK mocked).
- The cabinet and abhPromo are separate repos/services that agree only on the JSON shape
  of `catalogue.json` / `checker-config.json` and the `Promo` type (mirrored, not shared
  as a package — a shared types package is a possible later refactor).
