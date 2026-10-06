# CLAUDE.md

> Name: **Feedback**
> A social app for sharing unfinished music: upload rough song ideas, organize them into projects and playlists, control exactly who can hear them, and collect feedback pinned to specific moments in a track.

Read this file fully before making changes. If something here conflicts with a request, ask before deviating. Update this file whenever a decision changes.

---

## 1. Product summary

**Pitch:** SoundCloud meets Google Docs comments, for work-in-progress music.

**Core user loop**

1. Artist uploads a rough track (private by default).
2. Artist groups tracks into a **project** (album/EP/idea folder) and uploads new **versions** as the song evolves.
3. Artist shares privately (invite or secret link) or publicly, and says what feedback they want.
4. Listeners leave **timestamped comments** on the waveform.
5. Artist works through feedback (resolve/unresolved), then ships the next version.

**Product principles**

- **Trust first.** People only upload unfinished work if privacy controls are obvious and reliable. Private is the default everywhere.
- **Versions are first-class.** Feedback attaches to a specific version, never just "the track."
- **Feedback quality over vanity metrics.** Optimize for useful comments, not play counts.
- **Rough is fine.** Upload and capture flows must be fast and low-friction.

**Explicitly out of scope for now** (do not build or scaffold these)

- Geolocation, maps, places, PostGIS, location-based discovery or ranking
- Audio feature extraction / ML / embeddings
- Reputation scores, leaderboards, give-to-get credits
- Payments and monetization, **except** $1 artist donations (see "Donations" in section 11), plus direct messaging and live streaming
- Mobile apps (planned for Phase 8; keep the API client-agnostic so it's easy later)

---

## 2. Tech stack

| Concern          | Choice                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Language         | TypeScript everywhere (strict mode)                                                                    |
| Monorepo         | pnpm workspaces + Turborepo                                                                            |
| Web              | Next.js (App Router), React, Tailwind CSS                                                              |
| API              | Fastify + zod (type-provider), OpenAPI generated from schemas                                          |
| Database         | Postgres 16                                                                                            |
| ORM / migrations | Drizzle ORM + drizzle-kit                                                                              |
| Auth             | Clerk (web now, Expo later). API verifies JWTs; keep behind an `AuthPort` interface so it's swappable  |
| Object storage   | Cloudflare R2 (S3-compatible API), presigned direct uploads                                            |
| Jobs             | Redis + BullMQ                                                                                         |
| Audio processing | ffmpeg in the worker (transcode to AAC, extract duration, generate waveform peaks)                     |
| Realtime         | Start with polling/refetch. Add SSE or websockets only if needed                                       |
| Testing          | Vitest (unit/integration), Playwright (e2e), Testcontainers or docker-compose Postgres for DB tests    |
| Lint/format      | ESLint + Prettier, `tsc --noEmit` in CI                                                                |
| CI               | GitHub Actions                                                                                         |
| Local dev        | docker-compose for Postgres, Redis, pgweb (DB browser), and MinIO (S3-compatible, stands in for R2)    |
| Hosting          | Vercel (web), Fly.io or Railway (api + worker), Neon (Postgres), R2 (storage). Staging first (Phase 1) |
| Monitoring       | Low-cost first (Sentry, Grafana Cloud, or Better Stack), via pino + OpenTelemetry. Picked in Phase 1   |

If a choice above becomes painful, propose an alternative and record it in `docs/decisions/` as a short ADR before switching.

**Auth** (see [ADR 0002](docs/decisions/0002-auth-provisioning.md)): users are created as `pending` on their first authenticated API request; the Clerk session token carries an `email` claim. The web app reads its env from `apps/web/.env.local`, not the root `.env`.

**Pinned versions** (see [ADR 0001](docs/decisions/0001-runtime-and-toolchain-versions.md)): Node 26 (`.nvmrc`), pnpm 12 (installed via `npm i -g pnpm`; Node 26 has no corepack), TypeScript 6.0 (typescript-eslint doesn't support 7 yet), ESLint 9 (eslint-config-next isn't ready for 10). API and worker have no build step: Node runs `.ts` directly via type stripping, so use only erasable TS syntax (no `enum`/`namespace`) and `.ts` extensions in relative imports.

---

## 3. Repo layout

```
.
├── CLAUDE.md
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
├── apps/
│   ├── web/            # Next.js app
│   ├── api/            # Fastify HTTP API
│   ├── worker/         # BullMQ consumers (ffmpeg pipeline)
│   └── mobile/         # Expo app (Phase 8, not yet created)
├── packages/
│   ├── db/             # Drizzle schema, migrations, seed, query helpers
│   ├── shared/         # zod schemas, shared types, constants, API client
│   ├── authz/          # canAccess() and permission logic (pure, heavily tested)
│   └── config/         # shared tsconfig, eslint config
└── docs/
    ├── decisions/      # ADRs
    └── api.md          # generated or hand-maintained API notes
```

**Rules**

- `packages/authz` has **no I/O**. It takes already-loaded data and returns a decision. This keeps it trivially testable.
- `apps/web` and future `apps/mobile` talk to the API only through the typed client in `packages/shared`. They never import from `packages/db`.
- Validation schemas live in `packages/shared` and are used by both API and clients.

---

## 4. Commands

Every command a developer needs to run (starting services, migrating, seeding, admin tasks, tests) must be a script in the root `package.json`, so `pnpm <script>` is the only interface. Don't document raw `docker`, `node`, or tool commands as steps; wrap them in a script first. Keep the scripts below accurate.

(Not yet implemented: `test:e2e` (with Playwright). DB tests use a `feedback_test_<package>` database per package on the compose Postgres, created and migrated automatically by each package's vitest global setup; point `TEST_DATABASE_URL` at a different server to override.)

```bash
pnpm install
pnpm env:init                 # create .env and apps/web/.env.local from examples (never overwrites)
pnpm services:up              # start postgres, redis, pgweb in docker (object storage added in Phase 2)
pnpm services:down            # stop them (services:reset also wipes their data; services:logs tails logs)
pnpm db:migrate               # apply migrations
pnpm db:seed                  # dev seed data
pnpm dev                      # run web + api + worker via turbo
pnpm test                     # all unit/integration tests
pnpm test:e2e                 # playwright
pnpm lint
pnpm typecheck
pnpm db:generate              # generate a migration from schema changes
pnpm format                   # prettier (CI runs format:check)
pnpm admin:approve <email> [--by <admin-email>]   # let a pending user in
pnpm admin:reject <email>
```

Local URLs: web http://localhost:3000, API http://localhost:4000 (`/v1/health`, `/v1/openapi.json`), pgweb http://localhost:8081 (browses the `feedback` database; its connect screen can switch to a `feedback_test_*` database).

Before saying a task is done: `pnpm lint && pnpm typecheck && pnpm test` must pass.

---

## 5. Domain model

Use these names consistently. IDs are UUIDv7 (time-sortable) unless noted. All tables have `created_at`, `updated_at`. Use soft delete (`deleted_at`) for user content.

**Identity**

- `users`: id, auth_provider_id, email, access_status (`pending | approved | rejected`, default `pending`), approved_at, approved_by, created_at
- `profiles`: user_id, handle (unique, lowercase), display_name, bio, avatar_url, links

**Music**

- `projects`: id, owner_id, title, description, cover_url, status (`idea | demo | mixing | done`), visibility, deleted_at
- `tracks`: id, project_id, title, notes, position, current_version_id, visibility_override (nullable)
- `track_versions`: id, track_id, version_number, change_notes, feedback_prompt (what the artist wants feedback on), status (`uploading | processing | ready | failed`), duration_ms, original_key, stream_key, waveform_peaks (jsonb or R2 key), created_at
- Versions are **immutable** once `ready`. New edits = new version.

**Organization**

- `playlists`: id, owner_id, title, description, visibility
- `playlist_items`: playlist_id, track_version_id or track_id, position, added_at
- Distinction: **projects are the artist's own work**. **Playlists are curated collections** that may include other users' tracks the viewer has permission to hear.

**Sharing**

- `shares`: id, resource_type (`project | track`), resource_id, grantee_user_id (nullable), grantee_email (nullable, for invites to non-users), role (`listen | comment`), invited_by, accepted_at
- `share_links`: id, resource_type, resource_id, token_hash (store a hash, never the raw token), role, expires_at, revoked_at, created_by

**Feedback**

- `feedback`: id, track_version_id, author_id, parent_id (nullable, for replies), timestamp_ms (nullable, null = general comment), body, visibility (`public | artist_only`), status (`open | resolved`), resolved_at, deleted_at
- `feedback_votes`: feedback_id, user_id (a "helpful" mark)

**Social**

- `follows`: follower_id, followee_id
- `notifications`: id, user_id, type, payload (jsonb), read_at

Index for the hot paths: `tracks(project_id, position)`, `track_versions(track_id, version_number)`, `feedback(track_version_id, timestamp_ms)`, `shares(grantee_user_id)`, `share_links(token_hash)`.

---

## 6. Permissions and privacy (most important section)

### Visibility levels

Applied to projects (and optionally overridden per track):

- `private`: owner only
- `shared`: owner plus explicit grantees in `shares`
- `unlisted`: anyone holding a valid share link
- `public`: anyone; appears on profile and in discovery

### Roles

- `owner`: full control
- `comment`: listen + post feedback
- `listen`: listen only

### Rules

1. **Default is `private`.** New projects and tracks are private unless the user changes it.
2. **All authorization goes through `canAccess(actor, resource, action)` in `packages/authz`.** No route handler or UI component makes its own ad-hoc permission decisions.
3. Actions: `view`, `listen`, `comment`, `manage`, `download`.
4. **Downloads are off by default** and require an explicit per-project setting. Never expose original files to non-owners.
5. **Audio is served via short-lived signed URLs** (target: 5 to 15 minutes). The API issues a signed URL only after `canAccess(..., 'listen')` passes. Never return permanent public URLs for non-public audio.
6. Share links: unguessable (at least 128 bits of entropy), stored hashed, support expiry and revocation. Revoking takes effect immediately.
7. A track inherits its project's visibility unless `visibility_override` is set. An override can only be **more restrictive** than the project unless the owner explicitly widens it.
8. `artist_only` feedback is visible only to the track owner and the feedback's author.
9. Unauthenticated access to a non-public resource returns `404`, not `403`, to avoid leaking existence.
10. Deleting a project or track revokes all shares/links and invalidates outstanding signed URLs as soon as practical.

### Invite-only access (launch mode)

The service starts invite only. Anyone can create an account, but it stays `pending` until an admin approves it by hand.

- The approval gate lives in **our** `users.access_status`, not in the auth provider, so it survives swapping `AuthPort`.
- The API's auth plugin checks it: non-approved users get `403` with code `ACCOUNT_PENDING` (or `ACCOUNT_REJECTED`) on every route except `GET /v1/me`, which reports their status. Anonymous access to public or link-shared resources is unaffected.
- The web app shows a plain "you're on the list" screen to pending users.
- Admin approval starts as a CLI script (`pnpm admin:approve <email>` / `admin:reject`) that records `approved_at` and `approved_by`. An admin UI comes later if the queue gets big.
- Gate tests cover pending, approved, and rejected users on a protected route and on `/v1/me`.
- The gate is a root `onRequest` hook (`apps/api/src/auth/gate.ts`) that runs right after auth, so it covers every route by default. A route opts out only with `config: { allowUnapproved: true }` (today: `/v1/me`, `/v1/health`, `/v1/openapi.json`).

### Testing requirement

`packages/authz` must have exhaustive table-driven tests covering every combination of visibility x role x action x (owner / grantee / link-holder / stranger / anonymous). Any change to permission logic requires test updates in the same commit. Treat a permissions bug as a P0.

---

## 7. Audio pipeline

```
Client                API                      R2/S3              Worker
  | POST /uploads       |                         |                  |
  |-------------------->| create version row      |                  |
  |   presigned PUT URL |  (status=uploading)     |                  |
  |<--------------------|                         |                  |
  | PUT file ----------------------------------->| (original, private)
  | POST /uploads/:id/complete                   |                  |
  |-------------------->| enqueue job ------------------------------>|
  |                     | status=processing       |  ffmpeg: AAC + peaks + duration
  |                     |<------------------------------------------| status=ready
```

- Accepted inputs: mp3, wav, m4a, aac, flac, ogg. Enforce max size (start at 200 MB) and max duration (start at 20 min). Validate by sniffing, not only by extension.
- Output: AAC (m4a) stream file, plus waveform peaks (about 1000 points, normalized 0 to 1) and `duration_ms`.
- Originals live in a **private** bucket/prefix. Stream files likewise; both only reachable via signed URLs.
- Worker jobs must be **idempotent** and retry-safe. Failed jobs set `status=failed` with a user-visible reason.
- Uploads must never block the API process. No transcoding in request handlers.
- Start with progressive AAC. Move to HLS only if there's a concrete need.

---

## 8. API conventions

- REST, JSON, versioned under `/v1`. OpenAPI generated from zod schemas.
- Auth: `Authorization: Bearer <jwt>`; verified in a Fastify plugin that populates `request.actor` (or anonymous).
- Every route: validate input with zod, call `canAccess`, then do work. In that order.
- Errors use a consistent shape: `{ error: { code, message, details? } }`.
- Pagination: cursor-based (`?cursor=&limit=`), never offset for feed-like lists.
- No business logic in route handlers beyond orchestration; put it in service modules (`apps/api/src/modules/<domain>/`).
- Each module: `routes.ts`, `service.ts`, `repo.ts`, `*.test.ts`.

---

## 9. Frontend conventions (web)

- App Router; server components by default, client components only where interactivity requires it.
- **Keep the client light.** Prefer what React and Next.js already provide over new libraries; justify any client-side dependency by what it saves us.
- Data fetching through the typed client in `packages/shared`. Fetch in server components by default; mutate with server actions or route handlers, then `router.refresh()` / `revalidatePath()`. For the few client-side needs (e.g. polling a version until it's `ready`), use a small hook in the app. No TanStack Query unless client-side caching becomes a real pain point (revisit in Phase 5).
- Waveform player is a reusable component: renders peaks, supports click-to-seek, shows comment markers at their timestamps, and clicking a marker scrolls to that comment.
- Global audio player persists across navigation (mini-player), controlled by a single audio store: a small module that owns the one `HTMLAudioElement`, exposed to components through `useSyncExternalStore` so only subscribers to a changed value re-render. No Zustand. Only one track plays at a time.
- Accessibility: keyboard controls for play/pause/seek, visible focus states, semantic HTML, labelled controls.
- Mobile-first responsive layouts. Many users will open share links on a phone.
- Keep components small, colocate styles, avoid premature abstraction.

### Visual style: Y2K / Winamp / LimeWire

> **Styling is deferred.** Don't add CSS, Tailwind classes, design tokens, or themed primitives until asked. Build pages with plain semantic HTML (accessibility rules above still apply). The direction below is the future plan, not current work.

The app should feel like a late-90s/early-2000s desktop music app reimagined for Gen Z and Gen Alpha: nostalgic and playful, but clean enough to use every day. It's a nod to that era, not a costume.

**References and what to borrow**

- **Winamp:** the player is the hero. Use skinned "hardware" chrome around the player, an LCD-style time/track readout (green or cyan on near-black), a scrolling track title, a spectrum/oscilloscope-style visualizer, and chunky transport buttons. The waveform player and mini-player should look like this.
- **LimeWire:** lime green as the signature accent, glossy gradient toolbars, dense sortable results tables for lists (tracks, versions, feedback), and striped progress bars for uploads and processing.
- **Y2K / early Windows and Mac:** chrome and iridescent gradients, glossy "bubble" buttons, bevelled window panels with title bars, pixel icons, sparkles/stars, and the occasional holographic or translucent "Aqua" surface.

**Guardrails** (these come before the aesthetic)

- **Privacy and permission UI stays clear and serious.** Share dialogs, visibility settings, and destructive actions use plain, unambiguous language and states. No ironic copy, novelty icons, or hidden meaning there. Trust comes first (section 1).
- **Accessibility still applies.** Text and controls meet WCAG AA contrast. Gradients and chrome never sit behind body text without a solid backing. Focus states stay clearly visible (a bright glow outline fits the theme). Respect `prefers-reduced-motion`: no scrolling marquees, sparkles, or animated visualizers when it's set.
- **Readable type.** Pixel or bitmap-style fonts are for display only: logos, headings, LCD readouts, short labels. Body text, comments, and forms use a clean sans-serif.
- **Mobile-first still holds.** Desktop-window motifs (title bars, bevels) must collapse gracefully at phone width; no fake windows that need horizontal scrolling.
- **Evoke, don't copy.** No Winamp, LimeWire, Microsoft, or Apple logos, names, skins, or copied assets. Build original components and icons in the spirit of the era.
- **Restraint.** Pick one or two signature moments per screen (usually the player plus one accent). Not every surface should be chrome.

**Implementation**

- Define the theme as design tokens (CSS variables) in `apps/web/app/globals.css` and expose them through Tailwind's `@theme`. Components use tokens, never one-off hex values.
- Core palette to start from: near-black base, lime green primary accent, LCD green/cyan for readouts, chrome/silver neutrals, with hot pink or electric blue as secondary accents. Tune for contrast before shipping.
- Support dark mode first (it fits the era). Light mode can come later through the same tokens.
- Build a small set of themed primitives (window panel, bevel button, LCD display, progress bar, results table) and reuse them instead of styling ad hoc.
- Room to grow: user-selectable "skins" (Winamp-style) are a natural future feature. Keep tokens structured so a skin is just a different token set, but don't build skin switching until it's asked for.

---

## 10. Code conventions

- TypeScript `strict: true`; no `any` without a comment explaining why.
- Prefer pure functions and explicit types at module boundaries.
- Validate at every trust boundary (HTTP input, job payloads, env vars). Env vars are parsed through a zod schema at startup; the app should fail fast if invalid.
- No secrets in the repo. `.env.example` is maintained; real values never committed.
- Database changes only via migrations (`pnpm db:generate`); never hand-edit applied migrations.
- Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). Small, focused commits.
- Log with a structured logger (pino). Never log tokens, signed URLs, or share-link tokens.
- Write tests alongside code. Prioritize: authz, audio pipeline state machine, share-link lifecycle, feedback visibility.

### Delivery and monitoring

These apply from Phase 1 on.

- **`main` is always deployable.** Every merge to `main` deploys to staging automatically. If `main` breaks, fixing or reverting it comes before anything else merges.
- **Deploys only come from CI**, never from a laptop. Build each image once and promote that same image from staging to production; never rebuild per environment.
- **Migrations must work with the release that's already running** (expand first, contract in a later deploy), so a deploy or rollback never breaks the live version.
- **Monitoring starts cheap.** Datadog does the job but gets expensive quickly (per-host and per-GB pricing). Start with tools that have free or low-cost tiers, such as Sentry (errors), Grafana Cloud (logs, metrics, traces), or Better Stack (logs, uptime). Move to Datadog or similar only if we outgrow them.
- **Stay vendor-neutral.** Log JSON to stdout with pino and use OpenTelemetry for traces and metrics, so changing monitoring vendors is a config change, not a code change (same idea as `AuthPort`).
- **Never send secrets or private content to monitoring.** The logging rule above applies: no tokens, signed URLs, share-link tokens, or audio. Scrub auth headers and query strings from error reports.

---

## 11. Phased roadmap and definitions of done

Work **one phase at a time**. Do not start a phase until the previous one's checklist is complete and I've confirmed. At the start of each phase, propose a short task breakdown for approval.

**Feature branches with detailed PRs.** All work, phase or not, happens on a short-lived feature branch off `main` and lands through a reviewed PR. Never commit directly to `main`.

- **A phase is usually several PRs.** Each PR is one coherent slice that works on its own (for example: the upload endpoint, then the worker job, then the player). Because every merge to `main` deploys to staging, each PR must leave `main` working. Keep unfinished user-facing features hidden (an unlinked route or a flag) rather than holding them back on a long-lived branch.
- **Name branches `<type>/<slug>`**, using the conventional-commit type (e.g. `feat/presigned-uploads`, `fix/me-route-gate`, `docs/staging-phase`). Keep them short-lived and up to date with `main`.
- **Every PR has a detailed description** covering:
  - **Summary:** what it delivers and why, and which phase it belongs to
  - **What changed:** grouped by area (db, api, web, tooling, docs), noting new dependencies and why
  - **Decisions:** anything that differs from this file or the approved plan, and new ADRs
  - **How to test:** exact `pnpm` commands and manual steps
  - **Checklist:** the phase's definition-of-done items this PR completes or moves forward, and what's left
- Keep the PR description current as more commits land on the branch.

### Phase 0: Foundation

- [ ] Monorepo (pnpm + Turborepo), shared tsconfig/eslint, scripts from section 4 _(done except `test:e2e` script)_
- [ ] docker-compose with Postgres, Redis, MinIO _(Postgres + Redis done; S3 stand-in pending, MinIO no longer publishes free images)_
- [x] `packages/db` with Drizzle set up, first migration (users, profiles), seed script
- [x] Env validation, structured logging, health check endpoint
- [x] CI running lint, typecheck, tests (with a Postgres service)
- [ ] Auth wired end to end: sign in on web, API verifies JWT, `GET /v1/me` works _(code done and tested with a fake AuthPort; needs a manual sign-in with real Clerk keys)_
- [ ] Invite-only gate: new users are `pending`; the API rejects everything except `GET /v1/me` for non-approved users; web shows a waiting screen; an admin can approve or reject (see "Invite-only access" in section 6) _(code done; routes opt out with `config: { allowUnapproved: true }`; needs the manual check)_
- **Done when:** a fresh clone can run `pnpm i && pnpm services:up && pnpm db:migrate && pnpm dev` and sign in locally.

### Phase 1: Staging and continuous delivery

Get the app onto a staging environment as early as possible, so every later phase ships in small, deployed steps instead of one big launch. Staging uses the providers planned for production, so it also rehearses the production deploy in Phase 7. See "Delivery and monitoring" in section 10 for the rules that apply from here on.

- [ ] Hosting picked and recorded in an ADR: Vercel (web), Fly.io or Railway (api + worker), Neon (Postgres), managed Redis (Upstash or the host's add-on), and a separate Clerk instance. Staging never shares a database, bucket, or keys with local dev or production.
- [ ] One container image for api and worker (Node runs `.ts` directly, so no build step), built once in CI and tagged with the commit SHA.
- [ ] Continuous deployment: every merge to `main` deploys to staging automatically, only after CI passes. Order: run migrations, deploy api + worker, deploy web, smoke test (`/v1/health` and the web home page). A failure at any step stops the deploy and fails the workflow.
- [ ] Preview deploys of the web app for each PR (Vercel), pointed at the staging API.
- [ ] Secrets live in the hosts' secret stores and GitHub Environments, never in the repo or CI logs. Staging env vars are validated at startup, same as local.
- [ ] Rollback is one documented step (redeploy the previous image), tested once.
- [ ] Branch protection on `main`: PR required, CI must pass.
- [ ] Monitoring baseline: error tracking for web, api, and worker; an uptime check on `/v1/health`; pino logs shipped and searchable; alerts on new errors and downtime. Vendor picked and recorded in an ADR.
- [ ] Staging is invite-only (the approval gate), holds no real user data, and is excluded from search engines.
- Object storage (R2) and ffmpeg in the worker image are added to staging in Phase 2, alongside uploads.
- **Done when:** merging a PR to `main` puts it on staging with no manual steps; a failing test or migration blocks the deploy; I can sign in on staging and be approved; a deliberately thrown error shows up in monitoring and triggers an alert; and a rollback has been done once.

### Phase 2: Upload and playback (vertical slice)

- [ ] Presigned upload flow, `track_versions` state machine
- [ ] Worker: ffmpeg to AAC, duration, waveform peaks
- [ ] Waveform player component, global mini-player
- [ ] Track page (owner only; everything private)
- **Done when:** I can upload a file, watch it go `processing` to `ready`, and play it with a waveform. Pipeline has integration tests including a failure case.

### Phase 3: Projects and versions

- [ ] Projects CRUD, cover art upload, status field
- [ ] Add/reorder tracks in a project
- [ ] Upload new version of a track, version history UI, change notes
- [ ] A/B switch between versions in the player
- **Done when:** I can build a 5-track project, upload v2 of a song, and compare v1 vs v2.

### Phase 4: Sharing and permissions

- [ ] `packages/authz` with `canAccess` and exhaustive tests (write these **first**)
- [ ] Visibility settings, invites by user/email, roles
- [ ] Share links with expiry and revoke
- [ ] Signed audio URLs gated by `canAccess`
- [ ] Share dialog UI; public listen page that works for logged-out link holders
- **Done when:** every row of the permission matrix is tested, and a manual pass confirms a stranger cannot reach private audio by any URL.

### Phase 5: Feedback

- [ ] Timestamped comments on the waveform, threaded replies
- [ ] Per-version "what I want feedback on" prompt
- [ ] Open/resolved status, artist-only vs public comments
- [ ] Notifications (in-app first, email digest optional)
- **Done when:** a listener can comment at 1:23, the artist is notified, replies, and marks it resolved.

### Phase 6: Social layer

- [ ] Public profiles, follows, activity feed of followed artists' public updates
- [ ] User-made playlists (may include others' accessible tracks)
- [ ] Basic discovery: recent public, filter by genre/tag, search
- [ ] Reporting/blocking basics
- **Done when:** a new user can sign up, follow artists, build a playlist, and discover public work.

### Donations (planned, after Phase 6)

Listeners can send an artist a small donation to support a work in progress.

- **Capped at $1 per donation** to start, to limit fraud, scams, and chargeback exposure. Enforce the cap server-side; never trust an amount from the client. Raising the cap is a deliberate decision recorded here.
- Payment provider handles card data and artist payouts (no card data touches our servers). Proposed: Stripe Connect; confirm before building.
- Artists must opt in and complete the provider's identity verification before they can receive donations.
- Donations attach to a track (and the version being listened to) so artists see which work earned support.
- Abuse controls: per-donor rate limits, block self-donations, and a way to report and refund.
- No public donation totals or leaderboards (consistent with section 1).
- Payment state is driven by provider webhooks, verified by signature and handled idempotently.
- **Done when:** a listener can donate $1 to an opted-in artist on a track page, the artist sees it, and attempts to exceed the cap or donate to yourself are rejected and tested.

### Phase 7: Hardening and launch prep

- [ ] Rate limiting, abuse controls, upload quotas
- [ ] Observability beyond the Phase 1 baseline (dashboards, metrics, alert tuning), backups
- [ ] Privacy policy/ToS pages, account deletion and data export
- [ ] Performance pass, e2e suite for critical flows
- [ ] Production environment, deployed by promoting the same images that passed staging

### Phase 8: Mobile (Expo)

- [ ] Reuse `packages/shared` client and zod schemas
- [ ] Background playback + lock-screen controls (`react-native-track-player`)
- [ ] Push notifications
- [ ] **Quick-capture recording** straight into a new private track
- [ ] Share-link deep linking

### Later / parking lot

Reputation and give-to-get credits, local/geo features and place-based listening, audio analysis and auto-tagging, collaboration (stems, co-owners), embeds.

---

## 12. How to work with me (Claude Code)

- **Plan before coding** on anything non-trivial: summarize the approach and affected files, then wait for a go-ahead.
- Make **small, reviewable changes**. Prefer several focused PRs/commits over one giant one.
- **Work on feature branches**, one PR per coherent change, each with a detailed description (see section 11). Never commit to `main` directly.
- **Schema and authz first.** Show me migrations and `canAccess` changes before building UI on top of them.
- **No styling yet.** Web pages are plain semantic HTML until I ask for styling (see "Visual style" in section 9).
- **Every developer command is a root `package.json` script** (see section 4). Add the script when you add the need.
- **Write tests with the code**, and run `pnpm lint && pnpm typecheck && pnpm test` before declaring done.
- Don't add dependencies without saying why. Prefer well-maintained, widely used packages.
- Don't build anything from the out-of-scope list in section 1.
- If requirements are ambiguous, ask a specific question rather than guessing.
- Keep this file current: when we make a decision, add it here or in `docs/decisions/`.

## 13. Open questions (resolve before or during the relevant phase)

- Handle format rules
- Max upload size and per-user storage quota
- Whether tracks can be shared individually in Phase 4 or only whole projects at first
- Email provider for invites and notification digests (Resend or Postmark)
- API and worker host (Fly.io or Railway), decided in Phase 1
- Monitoring vendor (Sentry, Grafana Cloud, Better Stack, or a mix), decided in Phase 1
- Moderation approach for public content
- Donations: payment provider (Stripe Connect?), and how to handle fees. Card fees (roughly 30¢ + ~3%) take about a third of a $1 donation. Options include having the donor cover fees, batching, or accepting the loss at first.
