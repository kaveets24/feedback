# CLAUDE.md

> Name: **Feedback**
> A social app for sharing unfinished music: upload rough song ideas, organize them into projects, control exactly who can hear them, and collect feedback pinned to specific moments in a track.

Read this file fully before making changes. If something here conflicts with a request, ask before deviating. Update this file whenever a decision changes.

---

## 1. Product summary

**Pitch:** SoundCloud meets Google Docs comments, for work-in-progress music.

**Core user loop**

1. Artist uploads a rough track (private by default).
2. Artist groups tracks into a **project** (album/EP/idea folder) and uploads new **versions** as the song evolves.
3. Artist shares privately (secret link) or publicly, and says what feedback they want.
4. Listeners leave **timestamped comments** on the waveform.
5. Artist works through feedback (resolve/unresolved), then ships the next version.

**Product principles**

- **Trust first.** People only upload unfinished work if privacy controls are obvious and reliable. Private is the default everywhere.
- **Versions are first-class.** Feedback attaches to a specific version, never just "the track."
- **Feedback quality over vanity metrics.** Optimize for useful comments, not play counts.
- **Rough is fine.** Upload and capture flows must be fast and low-friction.

**Explicitly out of scope for now** (do not build or scaffold these)

- Geolocation, maps, places, PostGIS, location-based discovery or ranking. The one exception is a profile's optional city, a label the user picks from a fixed list that nothing filters, sorts, or ranks by (see `profiles` in section 5)
- Audio feature extraction / ML / embeddings
- Reputation scores, leaderboards, give-to-get credits
- Payments and monetization (the app starts free; $1 artist donations are parked, section 11), plus direct messaging and live streaming
- Mobile apps (planned for Phase 8; keep the API client-agnostic so it's easy later) and desktop apps (a folder-sync app is an idea in the parking lot, section 11)

---

## 2. Tech stack

| Concern          | Choice                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Language         | TypeScript everywhere (strict mode)                                                                              |
| Monorepo         | pnpm workspaces + Turborepo                                                                                      |
| Web              | Next.js (App Router), React, Tailwind CSS                                                                        |
| API              | Fastify + zod (type-provider), OpenAPI generated from schemas                                                    |
| Database         | Postgres 18 (local, CI, and Neon), see ADR 0004                                                                  |
| ORM / migrations | Drizzle ORM + drizzle-kit                                                                                        |
| Auth             | Clerk (web now, Expo later). API verifies JWTs; keep behind an `AuthPort` interface so it's swappable            |
| Object storage   | Backblaze B2 (S3-compatible API), presigned direct uploads. See ADR 0008                                         |
| Jobs             | Redis + BullMQ                                                                                                   |
| Audio processing | ffmpeg in the worker (transcode to AAC, extract duration, generate waveform peaks)                               |
| Realtime         | Start with polling/refetch. Add SSE or websockets only if needed                                                 |
| Testing          | Vitest (unit/integration), Playwright (e2e), Testcontainers or docker-compose Postgres for DB tests              |
| Lint/format      | ESLint + Prettier, `tsc --noEmit` in CI                                                                          |
| CI               | GitHub Actions                                                                                                   |
| Local dev        | docker-compose for Postgres, Redis, pgweb (DB browser), and SeaweedFS (S3-compatible, stands in for B2)          |
| Hosting          | Vercel (web), Fly.io (api + worker + Redis), Neon (Postgres), B2 (storage). Staging first, see ADR 0003 and 0008 |
| Monitoring       | Sentry (errors, logs, uptime, alerts), fed by pino JSON logs on stdout. See ADR 0006                             |

If a choice above becomes painful, propose an alternative and record it in `docs/decisions/` as a short ADR before switching.

**Auth** (see [ADR 0002](docs/decisions/0002-auth-provisioning.md)): users are created as `pending` on their first authenticated API request; the Clerk session token carries an `email` claim. The web app reads its env from `apps/web/.env.local`, not the root `.env`.

**Pinned versions** (see [ADR 0001](docs/decisions/0001-runtime-and-toolchain-versions.md) and [0005](docs/decisions/0005-node-24.md)): Node 24 LTS (`.nvmrc`; Vercel doesn't support 26 yet), pnpm 12 (installed via `npm i -g pnpm`, not corepack, which Node 25+ drops), TypeScript 6.0 (typescript-eslint doesn't support 7 yet), ESLint 9 (eslint-config-next isn't ready for 10). API and worker have no build step: Node runs `.ts` directly via type stripping, so use only erasable TS syntax (no `enum`/`namespace`) and `.ts` extensions in relative imports.

---

## 3. Repo layout

```
.
├── CLAUDE.md
├── PRODUCT.md          # product context for design tools (Impeccable); CLAUDE.md wins on conflicts
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
    ├── learning/       # owner's study notes (not a spec; don't rely on them)
    └── api.md          # generated or hand-maintained API notes
```

**Rules**

- `packages/authz` has **no I/O**. It takes already-loaded data and returns a decision. This keeps it trivially testable.
- `apps/web` and future `apps/mobile` talk to the API only through the typed client in `packages/shared`. They never import from `packages/db`.
- Validation schemas live in `packages/shared` and are used by both API and clients.

---

## 4. Commands

Every command a developer needs to run (starting services, migrating, seeding, admin tasks, tests) must be a script in the root `package.json`, so `pnpm <script>` is the only interface. Don't document raw `docker`, `node`, or tool commands as steps; wrap them in a script first. Keep the scripts below accurate.

(Not yet implemented: `test:e2e` (with Playwright, Phase 7). DB tests use a `feedback_test_<package>` database per package on the compose Postgres, created and migrated automatically by each package's vitest global setup; point `TEST_DATABASE_URL` at a different server to override. Worker tests run real ffmpeg, so install it locally (`brew install ffmpeg`); CI installs it, and the server image has its own static build.)

```bash
pnpm install
pnpm env:init                 # create .env and apps/web/.env.local from examples (never overwrites)
pnpm services:up              # start postgres, redis, pgweb, and object storage in docker; creates the bucket
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
pnpm image:build              # build the api/worker server image locally (feedback-server:local)
pnpm staging:deploy <sha>     # redeploy an earlier main commit to staging via CI (rollback)
pnpm staging:admin approve <email> [--by <admin-email>]   # same, on staging (runs inside Fly)
pnpm staging:admin reject <email>
pnpm staging:redis:deploy     # redeploy staging Redis by hand after its config changes merge (not part of CI deploys); starts it if left stopped
```

Staging (deploys, rollback, secrets, setup) is documented in [docs/staging.md](docs/staging.md).

Env vars: each app reads its own env file (`.env` for api, worker, and db scripts; `apps/web/.env.local` for web). Turbo runs tasks in strict env mode, so a var exported only in your shell (e.g. `FOO=1 pnpm dev`) never reaches the app; put it in the env file. `turbo.json` declares only what the web build reads from the process env on Vercel (see the comment there).

Local URLs: web http://localhost:3000, API http://localhost:4000 (`/v1/health`, `/v1/health/queue`, `/v1/openapi.json`), pgweb http://localhost:8081 (browses the `feedback` database; its connect screen can switch to a `feedback_test_*` database), object storage (S3 API) http://localhost:8333 with a file browser at http://localhost:8888/buckets/.

Before saying a task is done: `pnpm lint && pnpm typecheck && pnpm test` must pass.

---

## 5. Domain model

Use these names consistently. IDs are UUIDv7 (time-sortable) unless noted. All tables have `created_at`, `updated_at`. Use soft delete (`deleted_at`) for user content.

**Identity**

- `users`: id, auth_provider_id, email, access_status (`pending | approved | rejected`, default `pending`), approved_at, approved_by, created_at
- `profiles`: user_id, handle (unique, nullable; 3 to 20 lowercase letters, digits, or underscores, and not one of `RESERVED_HANDLES` in `packages/shared`, decided 2026-10-21; typed in any case and kept lowercase. Setting one gives an approved account a public page at `/@handle`, and clearing it takes the page down), display_name (what others see, e.g. on comments), bio, current_avatar_id (the newest `ready` picture, see `avatars`), city (nullable; one of `CITIES` in `packages/shared`, decided 2026-10-20; the picker groups them by region with `CITY_REGIONS`, and new ones are appended since Postgres adds enum values at the end), avatar_url (never used; a later migration drops it), links. A user has no profile row until they first save `/settings/profile` or a picture finishes processing. `/settings/profile` is theirs alone; the public page shows the handle, display name, bio, city and picture, and lists only their public tracks and projects (decided as nobody in particular, so the owner sees the same page as everyone). Comments show the display name and picture, linked to the public page when there's a handle.
- `avatars`: id, user_id, status (`uploading | processing | ready | failed`, the cover lifecycle), failure_reason, original_key, original_content_type, original_size_bytes, image_key (the re-encoded JPEG). A profile picture upload; it becomes the profile's current picture only if it's newer than the current one, and removing the picture clears `current_avatar_id` and keeps the rows (decided 2026-10-20).

**Music**

- `projects`: id, owner_id, title, description, current_cover_id (the newest `ready` cover, see `project_covers`), release_type (`single | ep | album | compilation`, default `single`; replaced the `idea | demo | mixing | done` status on 2026-10-20, and the old `status` column is dropped), visibility, deleted_at. Deleting a project soft-deletes it and leaves its tracks loose, with their versions; it never deletes songs.
- `tracks`: id, owner_id, project_id (nullable: a track without one is a "loose" track), title, notes, position (nullable, only meaningful in a project), visibility (default `private`; a loose track's own visibility), current_version_id (the newest `ready` version), visibility_override (nullable; for a track in a project, see rule 7 in section 6), deleted_at. Track lists leave out tracks whose versions are all still `uploading` (the file never arrived); Phase 7 cleans them up. A track can only join a project with the same owner (a composite foreign key on `(project_id, owner_id)` enforces it). Positions sort ascending and may have gaps; they aren't unique in the database, so changes to an owner's project membership and order take a lock on that owner's `users` row (`packages/db/src/projects.ts`).
- `project_covers`: id, project_id, status (`uploading | processing | ready | failed`, the same lifecycle as versions), failure_reason, original_key, original_content_type, original_size_bytes, cover_key (the re-encoded JPEG). A cover becomes the project's current cover only if it's newer than the current one; removing the cover clears `current_cover_id` and keeps the rows.
- `track_versions`: id, track_id, version_number, change_notes, feedback_prompt (what the artist wants feedback on), status (`uploading | processing | ready | failed`), failure_reason (shown to the artist), original_key, original_filename, original_content_type, original_size_bytes, stream_key, duration_ms, waveform_peaks (jsonb `number[]`), created_at
- Versions are **immutable** once `ready`. New edits = new version.
- A version belongs to its track, never directly to a project. `(track_id, version_number)` is unique; numbers count up per track and are **never reused** (a failed v3 stays v3, the next upload is v4). Everything else refers to a version by its `id`.
- Status moves `uploading -> processing -> ready`, or to `failed` from either of the first two; `ready` and `failed` are terminal. The transition table is `canTransition()` in `packages/shared`, and the status updates in `packages/db` are compare-and-set, so repeats are harmless.

**Sharing**

- Sharing is by link only for now. Invites to specific people (a `shares` table with grantees, and a visibility level for it) are parked; see "Later / parking lot" in section 11.
- `share_links`: id, resource_type (`project | track`), resource_id, token_hash (store a hash, never the raw token: SHA-256 hex, which a check constraint enforces), role (no longer read: every link lets signed-in holders comment, decided 2026-10-20; new links take its default, and a later migration drops it), expires_at (null = never), revoked_at, created_by. Links are never deleted, only revoked, so they keep a record of what was shared. `resource_id` has no foreign key since it points at either table; both are only soft-deleted, and deleting a project revokes its links (`packages/db/src/projects.ts`)

**Feedback**

- `feedback`: id, track_version_id, author_id, parent_id (nullable, for replies), timestamp_ms (nullable, null = general comment), body (up to 2000 characters, not blank), visibility (`public | artist_only`), status (`open | resolved`), resolved_at (set exactly when resolved), deleted_at. No per-comment visibility: everyone who can see the track can read its comments (artist-only comments were dropped on 2026-10-21 as more than we need). Replies go one level deep: a reply's parent is a top-level comment on the same version (a composite foreign key on `(parent_id, track_version_id)` enforces the version; the API, the depth). Replies have no timestamp and are never resolved (a check constraint enforces both). Comments are soft-deleted; deleting a version or an account removes them (decided 2026-10-21)
- `feedback_votes`: feedback_id, user_id (a "helpful" mark)

**Social**

- `follows`: id, follower_id, followee_id (unique together; nobody follows themselves, a check constraint enforces it). You follow someone through their public page, so only approved accounts with a handle can be followed, and someone who clears their handle (or loses approval) drops out of their followers' lists and feeds until they have a page again. No follower counts anywhere (section 1: no vanity metrics), and following notifies no one (decided 2026-10-21)
- `notifications`: id, user_id (who it's for), type (`comment | reply`), feedback_id (the comment it's about; it points rather than copying a payload, so an edit shows and a deleted comment, version, or account takes its notifications with it), read_at. For now only the artist is notified, of someone else's comment or reply on their track; listeners who came by link can't be sent back to it (the token isn't stored), so reply notifications for them wait (decided 2026-10-21)

Index for the hot paths: `tracks(project_id, position)`, `track_versions(track_id, version_number)`, `feedback(track_version_id, timestamp_ms)`, `share_links(token_hash)`.

---

## 6. Permissions and privacy (most important section)

### Visibility levels

Applied to projects (and optionally overridden per track):

- `private`: owner only. Share links do nothing: making something private shuts its links off without revoking them
- `unlisted`: anyone holding an active share link
- `public`: anyone; appears on profile and in discovery

### Roles

- `owner`: full control
- `listener`: anyone else who can see it (by visibility or a share link): view, listen, and comment if signed in. **If you can see it, you can give feedback on it** (decided 2026-10-20; links used to carry a `listen` or `comment` role)

### Rules

1. **Default is `private`.** New projects and tracks are private unless the user changes it.
2. **All authorization goes through `canAccess(actor, resource, action)` in `packages/authz`.** No route handler or UI component makes its own ad-hoc permission decisions.
3. Actions: `view`, `listen`, `comment`, `manage`, `download`.
4. **Downloads are off by default** and require an explicit per-project setting. Never expose original files to non-owners. Until that setting exists (it's not part of Phase 4), only the owner can download.
5. **Audio is served via short-lived signed URLs** (target: 5 to 15 minutes). The API issues a signed URL only after `canAccess(..., 'listen')` passes. Never return permanent public URLs for non-public audio.
6. Share links: unguessable (at least 128 bits of entropy), stored hashed, support expiry and revocation. Revoking takes effect immediately. A link never makes anyone an owner, and is made for a track or a project; a project's link reaches only those of its tracks that aren't private (decided 2026-10-20). Tokens are 32 random bytes (base64url) and travel in the `x-share-token` request header, never a query string; the API hashes and looks up the link on every request (`apps/api/src/auth/share-link.ts`), so revoking takes effect on the next one. A malformed or unknown token is ignored, not refused. A share URL is `/listen#<token>`: the token sits in the fragment, which browsers never send to a server, so it stays out of request logs and referrers; the page reads it in the browser and opens the link through server actions that call the API with only the token, never the visitor's session (`sharedApi()` in `apps/web/lib/api.ts`), so a link works the same for everyone who holds it. Comments are the one exception, since a comment needs an author: an approved, signed-in visitor's comment calls carry their session as well as the token (`sharedApiAs()`), and signing in on the listen page is a Clerk modal, so the link never leaves the fragment (decided 2026-10-21). The web app turns off Next's dev logging of server action arguments for the same reason.
7. A track inherits its project's visibility unless `visibility_override` is set. An override can only be **more restrictive** than the project unless the owner explicitly widens it. A loose track (no project) uses its own `visibility`; a project track's own `visibility` is ignored (`effectiveVisibility()`). **Moving a track never widens who can hear it:** joining a project with a wider visibility gives the track an override at its old visibility (`overrideOnJoin()`), and leaving a project sets its own `visibility` to the effective one it had (decided 2026-10-20).
8. Everyone who can see a track can read all of its comments; there are no private or artist-only comments (decided 2026-10-21). Decisions about one comment go through `canAccessFeedback(actor, track, feedback, action)` in `packages/authz`, which first requires `canAccess(..., 'view')` on the track: losing access to a track (a revoked link, say) takes away its comments too, your own included. Its actions: `read`; `reply` (may comment on the track, so signed in); `edit` (the author only); `delete` (the author, or the track owner); `resolve` and reopen (the track owner only).
9. Unauthenticated access to a non-public resource returns `404`, not `403`, to avoid leaking existence.
10. Deleting a project or track revokes all share links and invalidates outstanding signed URLs as soon as practical. Today that's when they expire: the API refuses new stream URLs at once, but one already issued keeps working until its 10 minutes run out (the same holds after revoking a link or making something private).
11. Commenting needs an account: anonymous visitors, with a link or on something public, can view and listen only. There are no guest comments.
12. **Listeners see finished work only.** Anyone but the owner gets only `ready` versions (others are a 404), never file names, the track's own notes, or cover upload progress, and a track's `project_id` only if they may view that project. Owner-only details are decided with `canAccess(..., 'manage')` (`canManage()` in `apps/api/src/auth/authz.ts`).

### Invite-only access (launch mode)

The service starts invite only. Anyone can create an account, but it stays `pending` until an admin approves it by hand.

- The approval gate lives in **our** `users.access_status`, not in the auth provider, so it survives swapping `AuthPort`.
- The API's auth plugin checks it: non-approved users get `403` with code `ACCOUNT_PENDING` (or `ACCOUNT_REJECTED`) on every route except `GET /v1/me`, which reports their status. Anonymous access to public or link-shared resources is unaffected.
- The web app shows a plain "you're on the list" screen to pending users.
- Admin approval starts as a CLI script (`pnpm admin:approve <email>` / `admin:reject`) that records `approved_at` and `approved_by`. An admin UI comes later if the queue gets big.
- Gate tests cover pending, approved, and rejected users on a protected route and on `/v1/me`.
- The gate is a root `onRequest` hook (`apps/api/src/auth/gate.ts`) that runs right after auth, so it covers every route by default. A route opts out only with `config: { allowUnapproved: true }` (today: `/v1/me`, `/v1/health`, `/v1/openapi.json`).

### Testing requirement

`packages/authz` must have exhaustive table-driven tests covering every combination of visibility x action x (owner / link-holder / stranger / anonymous), and for feedback, action x (artist / author / other listener / anonymous) at every track visibility, with and without a link. Any change to permission logic requires test updates in the same commit. Treat a permissions bug as a P0.

---

## 7. Audio pipeline

```
Client                API                      B2/S3              Worker
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
- How the worker does it (`apps/worker/src/transcode/`): one ffmpeg pass writes the stream (192 kbps stereo AAC, resampled to 48 kHz only if higher, at `streams/<versionId>`) and pipes mono samples for the peaks and the exact duration (counted from decoded samples, since headers can lie). Peaks are absolute: each point is the loudest sample in its slice as a fraction of full scale, so a quiet demo draws as quiet and the player can scale it for display.
- ffmpeg treats originals as hostile: it may read only local files (no URLs, so a crafted playlist can't fetch anything) with only the demuxers for the accepted formats, keeps only the first audio stream, and drops all metadata (tags can hold things the artist didn't mean to share).
- A file that can't be used fails at once with a reason; any other error is retried (3 attempts, set by the API when it queues the job), and the last failed attempt marks the version failed and reports to Sentry.
- **Cover art** uses the same flow on its own `cover` queue: the browser PUTs a JPEG, PNG, or WebP (up to 10 MB) to `cover-originals/<coverId>`, the API sniffs its bytes on complete, and the worker (`apps/worker/src/cover/`) re-encodes it with ffmpeg, with the same input guards (only the three image demuxers, only local files), refusing anything over 50 megapixels before decoding. ffmpeg applies EXIF orientation, centre-crops to a square, scales down to at most 1024px, and writes `covers/<coverId>.jpg` with no metadata at all (photo EXIF can hold GPS location), then deletes the original. Covers are served like audio: short-lived signed URLs (10 minutes) in project responses.
- **Profile pictures** go through the same steps on an `avatar` queue (`avatar-originals/<avatarId>` in, `avatars/<avatarId>.jpg` out, at most 512px), with the same image job in `apps/worker/src/cover/`. Only the user's own profile response carries the signed URL for now; others will see it next to comments.

---

## 8. API conventions

- REST, JSON, versioned under `/v1`. OpenAPI generated from zod schemas.
- Auth: `Authorization: Bearer <jwt>`; verified in a Fastify plugin that populates `request.actor` (or anonymous).
- Every route: validate input with zod, call `canAccess`, then do work. In that order.
- Errors use a consistent shape: `{ error: { code, message, details? } }`.
- Pagination: cursor-based (`?cursor=&limit=`), never offset for feed-like lists.
- No business logic in route handlers beyond orchestration; put it in service modules (`apps/api/src/modules/<domain>/`).
- Each module: `routes.ts`, `service.ts`, `repo.ts`, `*.test.ts`. Queries the worker also runs (tracks, versions, and projects, whose cover art it processes) live in `packages/db` instead, and those modules have no `repo.ts`.

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

> **Styling is deferred, except the player, the app header, home, the track page, the project pages, and the profile page.** The waveform player and mini-player (`apps/web/app/_player/`) were styled in Phase 2 (2026-10-19), with the first tokens and primitives in `globals.css` and the system recorded in `apps/web/DESIGN.md`. The shared app header (`apps/web/app/_shell/`) and the project pages (`apps/web/app/projects/`) followed in Phase 3 (2026-10-19), adding the working-screen primitives (buttons, fields, links) and the LCD segment picker (now the release type picker). Home (all four states, with the striped upload bar) followed the same day, then the track page (version history and new-version upload, 2026-10-20; its Feedback section and waveform markers, 2026-10-21), and the profile page (`/settings/profile`, with a preview of how your name signs a comment, 2026-10-20). Sign-in and sign-up only share the header's column width. Everything else stays plain semantic HTML until asked: don't add CSS, Tailwind classes, design tokens, or themed primitives elsewhere (accessibility rules above still apply). The direction below is the plan for the rest.

**Design tooling:** design work uses the [Impeccable](https://impeccable.style) agent skill, installed per developer as a Claude Code plugin (nothing vendored in the repo). Its product context lives in `PRODUCT.md`, which repeats this file's product facts; keep the two in sync. Its `apps/web/DESIGN.md` describes the styled parts so far and must follow the direction below; per-surface briefs live in `apps/web/.impeccable/surfaces/`. The plugin's detector hook checks UI files as they're edited.

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
- **Deploys only come from CI**, never from a laptop. Build each image once and promote that same image from staging to production; never rebuild per environment. The one exception is Redis: a stock, pinned image in its own Fly app, set up once and redeployed by hand (`pnpm staging:redis:deploy`) only when its tag or flags change, like provisioning Neon or B2.
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

**Complete.** Two items moved to later phases: the `test:e2e` script (Playwright) to Phase 7's e2e suite, and the S3 stand-in to Phase 2, where uploads first need it.

- [x] Monorepo (pnpm + Turborepo), shared tsconfig/eslint, scripts from section 4 _(except `test:e2e`, moved to Phase 7)_
- [x] docker-compose with Postgres, Redis, and pgweb _(S3 stand-in moved to Phase 2; MinIO no longer publishes free images)_
- [x] `packages/db` with Drizzle set up, first migration (users, profiles), seed script
- [x] Env validation, structured logging, health check endpoint
- [x] CI running lint, typecheck, tests (with a Postgres service)
- [x] Auth wired end to end: sign in on web, API verifies JWT, `GET /v1/me` works
- [x] Invite-only gate: new users are `pending`; the API rejects everything except `GET /v1/me` for non-approved users; web shows a waiting screen; an admin can approve or reject (see "Invite-only access" in section 6). Routes opt out with `config: { allowUnapproved: true }`.
- **Done when:** a fresh clone can run `pnpm i && pnpm services:up && pnpm db:migrate && pnpm dev` and sign in locally.

### Phase 1: Staging and continuous delivery

Get the app onto a staging environment as early as possible, so every later phase ships in small, deployed steps instead of one big launch. Staging uses the providers planned for production, so it also rehearses the production deploy in Phase 7. See "Delivery and monitoring" in section 10 for the rules that apply from here on.

- [x] Hosting picked and recorded in an ADR ([0003](docs/decisions/0003-staging-hosting-and-monitoring.md)): Vercel (web), one Fly.io app with `api` and `worker` process groups, Neon (Postgres), and a separate Clerk instance. Redis is added in Phase 2 with the first queue. Staging never shares a database, bucket, or keys with local dev or production.
- [x] One container image for api and worker (Node runs `.ts` directly, so no build step), built once in CI and tagged with the commit SHA.
- [x] Continuous deployment: every merge to `main` deploys to staging automatically, only after CI passes. Order: run migrations, deploy api + worker, deploy web, smoke test (`/v1/health` and the web home page). A failure at any step stops the deploy and fails the workflow.
- [x] Preview deploys of the web app for each PR (Vercel), pointed at the staging API. Previews are signed out ([ADR 0007](docs/decisions/0007-signed-out-previews.md)); a `Preview` check loads each one.
- [x] Secrets live in the hosts' secret stores and GitHub Environments, never in the repo or CI logs. Staging env vars are validated at startup, same as local.
- [x] Rollback is one documented step (redeploy the previous image), tested once (2026-10-13: `3c4233f` and back to `cf6c297`, about 2.5 minutes each way).
- [x] Branch protection on `main`: PR required, CI (`check`, `image`) must pass on an up-to-date branch, enforced for admins too. Repo made public to get it on the free plan.
- [x] Monitoring baseline: error tracking for web, api, and worker; an uptime check on `/v1/health`; pino logs shipped and searchable; alerts on new errors and downtime. All on Sentry's free tier ([ADR 0006](docs/decisions/0006-monitoring-on-sentry.md)).
- [x] Staging is invite-only (the approval gate), holds no real user data, and is excluded from search engines.
- Object storage (B2, see ADR 0008) and ffmpeg in the worker image are added to staging in Phase 2, alongside uploads.
- **Done when:** merging a PR to `main` puts it on staging with no manual steps; a failing test or migration blocks the deploy; I can sign in on staging and be approved; a deliberately thrown error shows up in monitoring and triggers an alert; and a rollback has been done once.

### Phase 2: Upload and playback (vertical slice)

**Complete** (2026-10-19).

- [x] S3-compatible object storage in docker-compose (SeaweedFS, stands in for B2 locally; moved from Phase 0)
- [x] Presigned upload flow, `track_versions` state machine _(API: `POST /v1/uploads`, `POST /v1/uploads/:versionId/complete`, `GET /v1/versions/:versionId`; the web upload form comes with the track page)_
- [x] Worker: ffmpeg to AAC, duration, waveform peaks _(BullMQ consumer; ffmpeg ships in the server image as a pinned static build)_
- [x] Waveform player component, global mini-player _(API: `GET /v1/versions/:versionId/stream` issues a 10-minute signed URL after `canAccess(..., 'listen')`; the player fetches a new one before resuming on an expired URL, or when playback fails, and carries on from the same spot. One audio store in `apps/web/lib/audio-store.ts`; the mini-player sits in the root layout. First styled surface, see section 9)_
- [x] Track page (owner only; everything private) _(home page lists your tracks and has the upload form; `/tracks/[trackId]` shows versions and polls while one processes. API: `GET /v1/tracks`, `GET /v1/tracks/:trackId`. The player sits on the track page)_
- **Done when:** I can upload a file, watch it go `processing` to `ready`, and play it with a waveform. Pipeline has integration tests including a failure case.

### Phase 3: Projects and versions

- [x] Projects CRUD, cover art upload, status field _(the status field became a release type, Single, EP, Album or Compilation, on 2026-10-20; deleting a project leaves its tracks loose. Cover art is re-encoded by ffmpeg in the worker: cropped square, resized, and stripped of all metadata, since photo EXIF can hold GPS location. Decided 2026-10-19. Shipped: JPEG/PNG/WebP up to 10 MB in, a square JPEG of at most 1024px out, shown beside the title and as list thumbnails; API `POST /v1/projects/:projectId/covers`, `.../covers/:coverId/complete`, `GET .../covers/:coverId`, `DELETE /v1/projects/:projectId/cover`. API: `POST /v1/projects`, `GET /v1/projects`, `GET`/`PATCH`/`DELETE /v1/projects/:projectId`; visibility isn't editable until Phase 4. Pages: `/projects` and `/projects/[projectId]`, with the release type as a clickable LCD segment picker)_
- [x] Add/reorder tracks in a project _(pages: drag a track by its grip, or focus the grip and use the up and down arrow keys, an add-a-track picker on the project page, and on the track page the project as a link with a Change button that opens a "Project" selector. API: `GET`/`POST`/`PUT /v1/projects/:projectId/tracks` (list, add to the end, set the full order; a stale order is a 409) and `DELETE /v1/projects/:projectId/tracks/:trackId`, which leaves the track loose)_
- [x] Upload new version of a track, version history UI, change notes _(API: `POST /v1/tracks/:trackId/versions` starts the next version's upload, finished by the same `POST /v1/uploads/:versionId/complete`; `PATCH /v1/versions/:versionId` edits a version's change notes, which stay editable while the audio is immutable. Decided 2026-10-20. Pages: the track page shows the version history newest first, each with its original file name and date, with notes edited in place, and an "Upload a new version" form with change notes)_
- [x] A/B switch between versions in the player _(on the track page, once a track has two ready versions: A is the current version, B the previous one, or any older version picked with "Compare with". Switching carries on at the same moment (capped at the shorter length), playing or paused as before; the A and B keys flip it. The audio store keeps each version's fresh stream URL and prefetches the other side's while playing, so a switch usually skips a round trip. Still one audio element, so a switch has a short gap. Decided 2026-10-20)_
- **Done when:** I can build a 5-track project, upload v2 of a song, and compare v1 vs v2.

### Phase 4: Sharing and permissions

**Complete** (2026-10-20). The manual pass ran every read and write route against a scratch database as anonymous and with live, revoked, expired, deleted, and private-resource links (track and project), and checked storage directly; nothing private was reachable. Signed-in strangers are covered by the API's route tests rather than by hand.

- [x] `packages/authz` with `canAccess` and exhaustive tests (write these **first**) _(the matrix in `packages/authz/src/index.test.ts` is written out by hand: every visibility x actor (owner, signed-in stranger, anonymous, each with and without a link) x action x resource kind, plus link expiry and revocation, project links on tracks, `effectiveVisibility`, and `overrideOnJoin`)_
- [x] Visibility settings, roles on share links _(links stopped carrying roles on 2026-10-20: every link allows comments from signed-in holders. Visibility done: `PATCH /v1/projects/:projectId` takes `visibility`, and `PATCH /v1/tracks/:trackId` sets a loose track's own or a project track's override, null following the project. Every route judges tracks by their effective visibility, so public things are open to anyone signed in or not)_
- [x] Share links with expiry and revoke _(API: `POST`/`GET /v1/tracks/:trackId/share-links` and `/v1/projects/:projectId/share-links` (create returns the token once; optional `expiresAt`, which must be in the future), `DELETE /v1/share-links/:linkId` revokes. All owner-only)_
- [x] Signed audio URLs gated by `canAccess` _(by effective visibility and any share link presented, for owners, public listeners, and link holders)_
- [x] Share dialog UI; public listen page that works for logged-out link holders _(listen page done: `/listen#<token>` shows a shared track (player with A/B, its ready versions) or project (cover, description, tracks to pick and play), signed out or in, and a plain "This link doesn't work" for anything else. API: `GET /v1/share-links/current`. Plain HTML apart from the player, cover, and comments until it's styled. Sharing settings done: a "Sharing" section on the track and project pages sets who can listen (only you, anyone with a link, anyone, or for a project track the same as the project) with an explicit Save, makes links (never, 1, 7 or 30 days) and shows a new link once to copy, and turns links off after a confirm. Making a link on something private says so and makes it link-only in the same press. The line under a project's title says who can listen)_
- **Done when:** every row of the permission matrix is tested, and a manual pass confirms a stranger cannot reach private audio by any URL.

### Phase 5: Feedback

**Complete** (2026-10-21).

- [x] Profile settings, so comments can show who wrote them _(page: `/settings/profile`, linked from the header as Profile, only for the signed-in user: display name, bio, an optional city, and an optional picture. API: `GET`/`PATCH /v1/me/profile`; the first save creates the profile. Pictures: `POST /v1/me/avatars`, `.../avatars/:avatarId/complete`, `GET /v1/me/avatars/:avatarId`, `DELETE /v1/me/avatar`, processed like cover art. Styled, with a live preview of how the name signs a comment)_
- [x] Timestamped comments on the waveform, threaded replies _(permissions and table done: `canAccessFeedback` with its hand-written matrix, and the `feedback` table, see section 5. API done: `GET`/`POST /v1/versions/:versionId/feedback` (list in threads, pinned comments in timeline order then general ones; comment at a moment up to the version's length, or generally; ready versions only), `POST /v1/feedback/:feedbackId/replies`, `PATCH /v1/feedback/:feedbackId` (the author edits the body, the artist resolves or reopens a thread), `DELETE /v1/feedback/:feedbackId` (soft; a deleted comment with replies keeps its place without its words or author). Each comment carries its author's display name and picture, never their id, and what the asker may do with it (`can`), so the UI never decides permissions itself. Reading works signed out; writing is a 401 until you sign in. Track page done: a Feedback section under the player shows the comments on the version it's showing (A or B), with a comment box whose moment follows the playhead until you type, replies, edit, delete, and resolve or reopen; ticks under the waveform jump to their comments. Listen page done: the same section under the player, readable by anyone with the link; approved, signed-in visitors comment through it, others get a Sign in to comment button (a modal) or a line saying their account is waiting for approval)_
- [x] Per-version "what I want feedback on" prompt _(`track_versions.feedback_prompt`, set with `PATCH /v1/versions/:versionId` (`feedbackPrompt`, beside `changeNotes`) and returned on every version. The artist writes it in the Feedback section on the track page; listeners read it above the comment box)_
- [x] Open/resolved status _(the artist resolves and reopens threads on the track page; artist-only comments dropped 2026-10-21: every comment is visible to everyone who can see the track)_
- [x] Notifications (in-app first, email digest optional) _(in-app done: someone else's comment or reply on your track notifies you. API: `GET /v1/notifications` (newest first, cursor pages), `GET /v1/notifications/unread-count`, `POST /v1/notifications/read`. A notification whose comment or track is gone is left out. Web: a bell in the header with the unread count (Profile is your picture, or a person icon until you have one, and on phones Sign out moves to the profile page), and `/notifications`, plain HTML until styled, which marks what it shows read and links each to the track page at its comment (`?comment=`, which shows that version and lights the thread). Email digest not built: its provider is an open question, section 13)_
- **Done when:** a listener can comment at 1:23, the artist is notified, replies, and marks it resolved.

### Phase 6: Social layer

- [x] Public profiles, follows, activity feed of followed artists' public updates _(the track and project pages open to anyone for public things, showing everyone but the owner the listen page's listener view (player, versions, comments; plain HTML apart from those), and a signed-out visitor who can't see one is sent to sign in, since it may be theirs. Track and project responses carry `canManage`, so the page knows whose controls to show. Unapproved accounts read public things as nobody (`viewerApi()` in `apps/web/lib/api.ts`), since the approval gate refuses their session. Public profiles done: a handle on `/settings/profile` (a taken one is a 409 `HANDLE_TAKEN`) gives an approved account a page at `/@handle`, which a rewrite in `next.config.ts` serves from `/profiles/[handle]`, plain HTML until styled. API: `GET /v1/profiles/:handle`, and `/tracks` and `/projects` under it (cursor pages, public only); anything else is a 404. Comment authors carry their handle. Follows and the feed done: Follow or Unfollow on `/@handle` (Sign in to follow when signed out; nothing for accounts waiting for approval), and `/feed`, linked in the header's nav, plain HTML until styled: the people you follow's new public tracks and new versions, newest first, then who you follow. The feed is computed when it's read (ready versions of tracks that are public by effective visibility, checked with `canAccess` as nobody in particular, like the public page), so making a track private takes it out at once. API: `PUT`/`DELETE /v1/profiles/:handle/follow` (repeats change nothing; following yourself is a 400 `CANNOT_FOLLOW_SELF`), `GET /v1/me/following`, `GET /v1/feed` (cursor pages), and `following` on `GET /v1/profiles/:handle`)_
- [ ] Basic discovery: recent public, filter by genre/tag, search
- [ ] Reporting/blocking basics
- Playlists and likes were dropped from this phase on 2026-10-22: projects already group an artist's own work, and follows and the feed cover keeping up with artists. Both are in the parking lot.
- **Done when:** a new user can sign up, follow artists, and discover public work.

### Phase 7: Hardening and launch prep

- [ ] Rate limiting, abuse controls, upload quotas, and cleanup of uploads that were started but never completed (versions left `uploading`, and their partial originals), and of versions left `processing` because their job was lost (e.g. Redis lost it, or it stalled past BullMQ's limit)
- [ ] Observability beyond the Phase 1 baseline (dashboards, metrics, alert tuning), backups
- [ ] Privacy policy/ToS pages, account deletion and data export
- [ ] Performance pass, e2e suite for critical flows (Playwright, run with `pnpm test:e2e`; moved from Phase 0)
- [ ] Production environment, deployed by promoting the same images that passed staging. Its B2 bucket needs the CORS rule set with the CLI, allowing only the production web origin (see "Backblaze B2" in docs/staging.md)
- [ ] SSO sign-in on Clerk: Google, plus any other providers we pick. Set up on each Clerk instance (staging and production) with our own OAuth credentials, and confirm the `email` session claim is still populated

### Phase 8: Mobile (Expo)

- [ ] Reuse `packages/shared` client and zod schemas
- [ ] Background playback + lock-screen controls (`react-native-track-player`)
- [ ] Push notifications
- [ ] **Quick-capture recording** straight into a new private track
- [ ] Share-link deep linking

### Later / parking lot

Reputation and give-to-get credits, local/geo features and place-based listening, audio analysis and auto-tagging, collaboration (stems, co-owners), embeds, invites to specific users or emails (a `shares` table plus a visibility level between `private` and `unlisted`; dropped from Phase 4 on 2026-10-15), playlists (curated collections that can include other people's tracks) and likes (a private list of tracks you liked), both dropped from Phase 6 on 2026-10-22.

**$1 artist donations (parked 2026-10-22: the app starts free).** If they come back, the earlier plan still holds: a $1 cap enforced server-side, a provider that handles cards and payouts (Stripe Connect was the proposal), artists opt in and pass the provider's identity checks, donations attach to a track and version, no self-donations, webhooks verified and handled idempotently, and no public totals. Card fees (roughly 30¢ + ~3%) take about a third of a $1 donation, so who covers them is the first question.

**Desktop sync app (idea, 2026-10-20).** A small Mac and Windows app that watches the music folders you pick (a DAW's bounce or export folder, say) and uploads new bounces as new versions automatically, so shipping v4 is just exporting it. Not planned yet; things to settle before building it:

- **Matching files to tracks:** how a new file becomes the next version of the right track rather than a new one (a file-name convention, a per-folder mapping, or asking the first time), and what happens to files it can't place.
- **Privacy:** everything it uploads is private, like any upload (rule 1 in section 6). It never changes visibility or makes links, and you choose the folders; it never scans the whole disk.
- **Auth:** long-lived, revocable device sign-in through `AuthPort`, not a pasted session token.
- **Same API, no special paths:** it uses the presigned upload flow (section 7) and the typed client in `packages/shared`, like web and mobile. Duplicate and half-written files (a bounce still being exported) need care, plus quotas and rate limits (Phase 7).
- **Stack:** pick one (e.g. Tauri or Electron) in an ADR when the time comes.

---

## 12. How to work with me (Claude Code)

- **Plan before coding** on anything non-trivial: summarize the approach and affected files, then wait for a go-ahead.
- Make **small, reviewable changes**. Prefer several focused PRs/commits over one giant one.
- **Work on feature branches**, one PR per coherent change, each with a detailed description (see section 11). Never commit to `main` directly.
- **Schema and authz first.** Show me migrations and `canAccess` changes before building UI on top of them.
- **No styling yet, beyond the player, the app header, home, the track page, the project pages, and the profile page.** Other web pages are plain semantic HTML until I ask for styling (see "Visual style" in section 9).
- **Every developer command is a root `package.json` script** (see section 4). Add the script when you add the need.
- **Write tests with the code**, and run `pnpm lint && pnpm typecheck && pnpm test` before declaring done.
- Don't add dependencies without saying why. Prefer well-maintained, widely used packages.
- Don't build anything from the out-of-scope list in section 1.
- If requirements are ambiguous, ask a specific question rather than guessing.
- Keep this file current: when we make a decision, add it here or in `docs/decisions/`.
- `docs/learning/` holds my personal study notes, digested from this file and the ADRs. They aren't a source of truth: don't use them to decide anything, and don't update them unless I ask.

## 13. Open questions (resolve before or during the relevant phase)

- Max upload size and per-user storage quota
- Email provider for notification digests (Resend or Postmark)
- Moderation approach for public content
