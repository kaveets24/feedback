# Decision log (study notes)

Personal learning notes: every architectural and process decision so far, each with the
**why**, what was given up, and when to revisit it. It's for understanding and explaining the
design (for example, in interviews), not a spec.

- **Not the source of truth.** These notes summarize [CLAUDE.md](../../CLAUDE.md) and the ADRs in
  [`docs/decisions/`](../decisions/). If they disagree, CLAUDE.md and the ADRs win, and these
  notes are out of date.
- **Status** values: **Built** (in the code on `main`), **In progress** (on a branch or PR),
  **Proposed** (written up, not accepted yet), **Planned** (decided, built in a later phase).
  Statuses are as of 2026-10-07.
- IDs (`D1`, `D2`, ...) are stable, so notes can refer to them.

## Index

| ID  | Decision                                                   | Status      |
| --- | ---------------------------------------------------------- | ----------- |
| D1  | Trust and privacy drive the architecture                   | Principle   |
| D2  | Versions are first-class and immutable                     | Planned     |
| D3  | All authorization goes through one pure `canAccess()`      | Planned     |
| D4  | Private by default; 404 instead of 403 for hidden things   | Planned     |
| D5  | Short-lived signed audio URLs; hashed share-link tokens    | Planned     |
| D6  | Invite-only gate that denies by default                    | Built       |
| D7  | Approval status lives in our database, not the auth vendor | Built       |
| D8  | Auth provider behind an `AuthPort` interface               | Built       |
| D9  | Create users lazily on first request, not via webhooks     | Built       |
| D10 | Email comes from a session-token claim                     | Built       |
| D11 | Monorepo with strict package boundaries                    | Built       |
| D12 | Zod schemas are the single source of truth for the API     | Built       |
| D13 | Route order: validate, authorize, then work                | Built       |
| D14 | Direct uploads plus a background worker for audio          | Planned     |
| D15 | Progressive AAC before HLS                                 | Planned     |
| D16 | UUIDv7 IDs and soft delete                                 | Built       |
| D17 | No build step for API and worker                           | Built       |
| D18 | Pinned toolchain versions                                  | Built       |
| D19 | Every developer command is a root `package.json` script    | Built       |
| D20 | A separate test database per package                       | Built       |
| D21 | Staging and continuous delivery before features            | In progress |
| D22 | Build one image, promote it unchanged                      | In progress |
| D23 | Migrations are expand-then-contract                        | Planned     |
| D24 | Small feature-branch PRs instead of one PR per phase       | Built       |
| D25 | Fly.io for API and worker, one app with two process groups | Proposed    |
| D26 | Cheap, vendor-neutral monitoring                           | Proposed    |
| D27 | Keep the web client light                                  | Planned     |
| D28 | Polling before realtime                                    | Planned     |
| D29 | Styling deferred                                           | Built       |
| D30 | Explicit out-of-scope list; donations capped at $1         | Principle   |

---

## Product principles

### D1. Trust and privacy drive the architecture

- **Status:** Principle
- **Decision:** Privacy is the organizing constraint, not a feature to add later. When a choice
  trades convenience against privacy, privacy wins.
- **Why:** Artists only upload unfinished work if they're sure it stays private. One leaked demo
  destroys the product's reason to exist. D3 to D7 all follow from this.
- **Tradeoff:** More upfront design (a permission matrix, signed URLs, hashed tokens) before any
  sharing feature ships.

### D2. Versions are first-class and immutable

- **Status:** Planned (Phase 3)
- **Decision:** Feedback attaches to a specific `track_version`, never just "the track". A
  version can't change once it's `ready`; any edit creates a new version.
- **Why:** A comment at 1:23 on v1 means nothing on v3. The core loop is upload, get feedback,
  ship the next version, so versions have to be the unit everything hangs off.
- **Alternatives:** Overwriting the track's audio in place. That's simpler, but every existing
  comment would point at audio that no longer exists.
- **Tradeoff:** More rows and storage, and the UI has to make switching versions easy (A/B
  compare is in Phase 3).

## Security and access

### D3. All authorization goes through one pure `canAccess()`

- **Status:** Planned (Phase 4). The types already exist in `packages/authz/src/index.ts`.
- **Decision:** One function, `canAccess(actor, resource, action)`, in `packages/authz`, which
  does **no I/O**: callers pass in data they've already loaded and get a decision back. No route
  handler or UI component makes its own permission decision.
- **Why:** Permission checks scattered across handlers are how privacy bugs happen; each new
  route is a new chance to forget one. A pure function can be tested exhaustively with a table
  covering visibility × role × action × actor type (owner, grantee, link holder, stranger,
  anonymous). Permission bugs are treated as P0.
- **Alternatives:** Checks inside each route, or enforcing permissions in SQL queries. Both
  spread the logic out and are much harder to test completely.
- **Tradeoff:** Callers do a bit more plumbing (load the data, then ask). In exchange, the rules
  live in one file with complete test coverage.

### D4. Private by default; 404 instead of 403 for hidden things

- **Status:** Planned (Phase 4)
- **Decision:** New projects and tracks are `private`. Unauthenticated requests for a non-public
  resource get `404`, not `403`. A track's override can only be _more_ restrictive than its
  project unless the owner explicitly widens it.
- **Why:** Defaults decide what most content ends up as, so the safe state has to be the
  default. A `403` confirms that something exists, which leaks information on its own.
- **Tradeoff:** Debugging access problems is a little harder because "not found" covers both
  cases.

### D5. Short-lived signed audio URLs; hashed share-link tokens

- **Status:** Planned (Phases 2 and 4)
- **Decision:** Audio is only served through signed URLs that expire in 5 to 15 minutes, issued
  after `canAccess(..., 'listen')` passes. Share-link tokens have at least 128 bits of entropy
  and only their hash is stored. Links support expiry and revocation.
- **Why:** A permanent URL can be forwarded forever, so revoking access would mean nothing.
  Hashing tokens means a database leak doesn't hand out working links.
- **Tradeoff:** The player has to refresh URLs, and downloads/caching are less convenient.

### D6. Invite-only gate that denies by default

- **Status:** Built (`apps/api/src/auth/gate.ts`)
- **Decision:** Every new account starts `pending`. A root `onRequest` hook blocks signed-in
  users who aren't approved (`403 ACCOUNT_PENDING` / `ACCOUNT_REJECTED`) on **every** route. A
  route opts out only with `config: { allowUnapproved: true }` (today: `/v1/me`, `/v1/health`,
  `/v1/openapi.json`). Admins approve with `pnpm admin:approve`.
- **Why:** Launching invite-only keeps early growth and abuse manageable. Making it a global hook
  means a new route is protected automatically: forgetting something fails closed, not open.
- **Alternatives:** A check added to each route that needs it. That fails open the first time
  someone forgets.
- **Tradeoff:** Approval is manual through a CLI. An admin UI comes later if the queue grows.

### D7. Approval status lives in our database, not the auth vendor

- **Status:** Built (`users.access_status`)
- **Decision:** `pending | approved | rejected` is a column on our `users` table, with
  `approved_at` and `approved_by`.
- **Why:** If the auth provider ever changes (D8), who's allowed in must not be lost or need a
  migration out of the vendor. It also gives us an audit trail.

## Authentication

### D8. Auth provider behind an `AuthPort` interface

- **Status:** Built (`apps/api/src/auth/port.ts`, ADR 0002)
- **Decision:** Clerk is behind a one-method interface, `verify(token) → identity | null`. Only
  `apps/api/src/auth/clerk.ts` imports Clerk's SDK.
- **Why:** It avoids vendor lock-in (switching providers means writing one new file), tests use
  a fake `AuthPort` and never call Clerk, and the future mobile app reuses the same bearer-token
  flow.
- **Tradeoff:** A thin extra layer of indirection.

### D9. Create users lazily on first request, not via webhooks

- **Status:** Built ([ADR 0002](../decisions/0002-auth-provisioning.md))
- **Decision:** The auth hook verifies the token and upserts a `pending` user, keyed by the
  provider's user ID, the first time someone makes an authenticated request.
- **Why:** No public webhook endpoint is needed (which also makes local dev simpler), there's one
  less moving part, and our `users` table stays the source of truth.
- **Alternatives:** Clerk webhooks pushing user-created/updated/deleted events.
- **Tradeoff (accepted):** An email change in Clerk only reaches our table on the user's next
  request, and deleting a user in Clerk doesn't delete ours.
- **Revisit when:** Instant sync or deletion matters. Account deletion is planned for Phase 7,
  and webhooks are the upgrade path.

### D10. Email comes from a session-token claim

- **Status:** Built ([ADR 0002](../decisions/0002-auth-provisioning.md))
- **Decision:** The Clerk session token is customized to include an `email` claim, and tokens
  are checked against `WEB_ORIGIN` (`authorizedParties`).
- **Why:** Verifying a request needs no network call to Clerk, which keeps requests fast and
  keeps the API stateless. The origin check rejects tokens issued to other sites.
- **Tradeoff:** It relies on a dashboard setting, so the API fails loudly with instructions if
  the claim is missing. PR preview deploys will need the origin check widened (see ADR 0003).

## Code structure

### D11. Monorepo with strict package boundaries

- **Status:** Built
- **Decision:** pnpm workspaces + Turborepo, with `apps/` (web, api, worker) and `packages/` (db,
  shared, authz, config). The web app (and later mobile) never imports `packages/db`; it talks
  to the API only through the typed client in `packages/shared`.
- **Why:** Shared code without publishing packages, one place to make changes that span apps,
  and a client-agnostic API, so the Phase 8 mobile app needs no backend rework.
- **Tradeoff:** More tooling setup than a single app.

### D12. Zod schemas are the single source of truth for the API

- **Status:** Built
- **Decision:** Request/response schemas live in `packages/shared`. The same schemas validate
  input in the API, type the client, and generate the OpenAPI document.
- **Why:** One definition means the docs, server validation, and client types can't drift apart.

### D13. Route order: validate, authorize, then work

- **Status:** Built (convention; authorize step arrives with D3)
- **Decision:** Every route validates input with zod, calls `canAccess`, and then does the work,
  in that order. Business logic lives in `modules/<domain>/service.ts`, not in route handlers.
  Errors share one shape: `{ error: { code, message, details? } }`.
- **Why:** A fixed order makes reviews easy (the permission check is always in the same place)
  and keeps handlers thin and services testable.

## Audio and data

### D14. Direct uploads plus a background worker for audio

- **Status:** Planned (Phase 2)
- **Decision:** The client uploads straight to object storage (R2) with a presigned URL. The API
  only creates a version row and enqueues a BullMQ job. A separate worker runs ffmpeg to make
  the AAC stream file, the duration, and the waveform peaks. Versions move through
  `uploading → processing → ready | failed`. Jobs are idempotent and safe to retry.
- **Why:** Transcoding is slow and CPU-heavy, and audio files are large. Keeping both out of the
  API keeps it fast and stateless and lets the worker scale on its own.
- **Alternatives:** Uploading through the API and transcoding in the request. That's simpler
  but blocks the API and couples its scaling to file sizes.
- **Tradeoff:** More moving parts (queue, worker, state machine), and failures need a reason
  the user can see.

### D15. Progressive AAC before HLS

- **Status:** Planned (Phase 2)
- **Decision:** Stream a single AAC (m4a) file per version.
- **Why:** It's simple and works everywhere, and nothing needs adaptive bitrate yet.
- **Revisit when:** There's a concrete need (long files, poor mobile networks).

### D16. UUIDv7 IDs and soft delete

- **Status:** Built (`packages/db/src/schema.ts`)
- **Decision:** IDs are UUIDv7, generated in the app. User content uses `deleted_at` instead of
  hard deletes. Feed-like lists use cursor pagination.
- **Why:** UUIDv7 is time-sortable, so it indexes well and works as a pagination cursor, unlike
  random UUIDv4. Soft delete makes recovery and the account-deletion flow manageable. Cursors
  stay correct when rows are added, where offsets skip or repeat items.

## Tooling

### D17. No build step for API and worker

- **Status:** Built ([ADR 0001](../decisions/0001-runtime-and-toolchain-versions.md))
- **Decision:** Node runs the `.ts` files directly using built-in type stripping.
- **Why:** No build step to configure, cache, or debug; what you run locally is what runs in the
  container.
- **Tradeoff:** Only erasable TypeScript syntax (no `enum` or `namespace`; use `as const`
  instead), and relative imports need `.ts` extensions.

### D18. Pinned toolchain versions

- **Status:** Built ([ADR 0001](../decisions/0001-runtime-and-toolchain-versions.md))
- **Decision:** Node 26, pnpm 12, TypeScript 6.0 (not 7), ESLint 9 (not 10).
- **Why:** Ecosystem support. typescript-eslint doesn't support TS 7 yet, and
  `eslint-config-next` isn't ready for ESLint 10.
- **Revisit when:** Those packages catch up.

### D19. Every developer command is a root `package.json` script

- **Status:** Built
- **Decision:** `pnpm <script>` is the only interface (services, migrations, seeding, admin,
  tests). Raw `docker` or `node` commands are never documented as steps.
- **Why:** One discoverable entry point, fewer onboarding mistakes, and the same commands work
  locally and in CI.

### D20. A separate test database per package

- **Status:** Built
- **Decision:** Each package's tests use their own `feedback_test_<package>` database, created
  and migrated automatically by vitest's global setup.
- **Why:** Turbo runs package test suites in parallel, and a shared database would make them
  interfere with each other.

## Delivery and operations

### D21. Staging and continuous delivery before features

- **Status:** In progress (Phase 1)
- **Decision:** The roadmap was reordered so staging and CD come right after the foundation,
  before any product features. Every merge to `main` deploys to staging after CI passes.
- **Why:** If deploys are set up early, every later feature ships in small, tested steps instead
  of one big, risky launch. Staging uses the production providers, so it rehearses the real
  deploy.
- **What changed:** Originally, deploying was part of launch prep at the end of the roadmap.
  Phase 1 was inserted so every later phase ships in small, deployed steps.

### D22. Build one image, promote it unchanged

- **Status:** In progress (branch `feat/container-image`)
- **Decision:** API and worker share one container image, built once in CI and tagged with the
  commit SHA. The same image goes to staging and later to production; it's never rebuilt per
  environment. Deploys only come from CI, never from a laptop.
- **Why:** What reaches production is byte-for-byte what was tested. One image also means the
  API and worker can never run mismatched versions.
- **Exception:** Next.js bakes `NEXT_PUBLIC_*` values in at build time, so the web app is built
  per environment from the same commit.

### D23. Migrations are expand-then-contract

- **Status:** Planned (applies from Phase 1)
- **Decision:** A schema change that would break the running release is split: add the new
  shape first, deploy code that uses it, and remove the old shape in a later deploy.
- **Why:** Migrations run before new code starts, so the old release keeps running against the
  new schema for a while, and a rollback must still work.

### D24. Small feature-branch PRs instead of one PR per phase

- **Status:** Built (process)
- **Decision:** All work goes through short-lived `<type>/<slug>` branches with detailed PR
  descriptions. A phase usually spans several PRs, each leaving `main` deployable.
  Unfinished features stay hidden behind unlinked routes or flags.
- **Why:** Once every merge to `main` deploys (D21), a big PR means a big, risky deploy. Small
  PRs are easier to review and to roll back.
- **What changed:** Originally one branch and PR per phase; changed when CD was added.

### D25. Fly.io for API and worker, one app with two process groups

- **Status:** Proposed (ADR 0003 on branch `docs/adr-0003-staging`, not merged yet)
- **Decision:** Vercel for web, one Fly.io app with `api` and `worker` process groups, Neon for
  Postgres, and a separate Clerk instance for staging.
- **Why:** Fly deploys a prebuilt image (fits D22), and its `release_command` runs migrations
  before new code starts and fails the deploy if they fail. One app means one release for both
  processes, while each group still scales separately.
- **Alternatives:** Railway (it builds from source more naturally, which works against D22).
- **Tradeoff:** An idle worker costs a few dollars a month before it has any jobs.

### D26. Cheap, vendor-neutral monitoring

- **Status:** Proposed (vendors in ADR 0003); logging rules built
- **Decision:** Sentry (errors) and Better Stack (uptime, logs, alerts) on free tiers. Logs are
  pino JSON on stdout, with OpenTelemetry later. Secrets, signed URLs, share tokens, and audio
  are never logged or sent to monitoring.
- **Why:** Datadog does the job but its per-host and per-GB pricing gets expensive fast. Standard
  formats (stdout JSON, OTel) make changing vendors a config change, the same idea as D8.

## Frontend

### D27. Keep the web client light

- **Status:** Planned (applies as the UI grows)
- **Decision:** Server components by default. Use what React and Next.js already provide before
  adding libraries: no TanStack Query (revisit in Phase 5) and no Zustand. The global audio
  player is a small module that owns the single `HTMLAudioElement`, exposed through
  `useSyncExternalStore`.
- **Why:** Many users will open share links on a phone, so less JavaScript means faster loads.
  Every client dependency has to justify what it saves us.

### D28. Polling before realtime

- **Status:** Planned
- **Decision:** Use polling/refetch (for example, waiting for a version to be `ready`). Add SSE
  or websockets only when needed.
- **Why:** Polling has no extra infrastructure and is enough at this scale.

### D29. Styling deferred

- **Status:** Built (pages are plain semantic HTML)
- **Decision:** No CSS, Tailwind classes, or design tokens until the core flows work. The Y2K /
  Winamp direction is documented in CLAUDE.md section 9 for later.
- **Why:** Styling built before the flows exist gets redone. Semantic HTML now keeps
  accessibility solid and makes the later styling pass straightforward.

## Scope

### D30. Explicit out-of-scope list; donations capped at $1

- **Status:** Principle
- **Decision:** CLAUDE.md section 1 lists what not to build (geo, ML, reputation scores,
  payments beyond donations, DMs, live streaming, mobile before Phase 8). Donations, when built,
  are capped at $1, enforced on the server.
- **Why:** A written "no" list prevents scope creep, and feedback quality matters more than
  vanity metrics. The $1 cap limits fraud and chargeback exposure while donations are new.
- **Revisit when:** Raising the cap is a deliberate decision recorded in CLAUDE.md.

---

## Keeping these notes useful

- When a decision is new or changes, add or update its entry with the next ID: **Decision**,
  **Why**, and where useful **Alternatives**, **Tradeoff**, **Revisit when**, **What changed**.
- Mark replaced decisions **Superseded by Dn** instead of deleting them. How the thinking changed
  is often the best part to explain.
- To practice, pick an entry and explain it out loud: the problem, the options, what you chose,
  what it cost, and what would make you change it.
