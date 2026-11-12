# CLAUDE.md

> Name: **Feedback**
> A social app for sharing unfinished music: upload rough song ideas, organize them into projects, control exactly who can hear them, and collect feedback pinned to specific moments in a track.

Read this file fully before making changes, then the docs below for the area you're touching. If anything in them conflicts with a request, ask before deviating. When a decision changes, update the doc it belongs in (or add an ADR) in the same PR.

## Docs

| Doc                                                                                  | What's in it                                                                     |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [docs/product.md](docs/product.md)                                                   | Pitch, core loop, principles, and the full out-of-scope list                     |
| [docs/domain-model.md](docs/domain-model.md)                                         | Every table, its columns and rules, and the names to use                         |
| [docs/permissions.md](docs/permissions.md)                                           | Visibility, roles, the numbered privacy rules, the approval gate, required tests |
| [docs/audio-pipeline.md](docs/audio-pipeline.md)                                     | Uploads, transcoding, covers and pictures, cleanup of stuck uploads              |
| [docs/frontend.md](docs/frontend.md)                                                 | Web conventions, the player and app shell, link previews, visual style           |
| [docs/conventions.md](docs/conventions.md)                                           | API, code, delivery, and monitoring conventions                                  |
| [docs/development.md](docs/development.md)                                           | Env files, local URLs, test databases                                            |
| [docs/plan.md](docs/plan.md)                                                         | Roadmap: phases and what shipped in each, backlog, parking lot, open questions   |
| [docs/staging.md](docs/staging.md)                                                   | Deploys, rollback, secrets, setup                                                |
| [docs/decisions/](docs/decisions/)                                                   | ADRs                                                                             |
| [apps/web/PRODUCT.md](apps/web/PRODUCT.md), [apps/web/DESIGN.md](apps/web/DESIGN.md) | Context for the Impeccable design tool; these docs win on conflicts              |

"Rule N" anywhere means rule N in [docs/permissions.md](docs/permissions.md).

## Product in brief

SoundCloud meets Google Docs comments, for work-in-progress music. Artists upload rough tracks, group them into projects, upload new versions as a song evolves, share by secret link or publicly, and collect timestamped comments on a specific version.

- **Trust first:** private is the default everywhere, and privacy controls must be obvious and reliable.
- **Versions are first-class:** feedback attaches to a version, never just "the track."
- **Feedback quality over vanity metrics:** no follower counts, play counts, or leaderboards.
- **Rough is fine:** upload and capture stay fast and low-friction.

**Out of scope** (don't build or scaffold; exceptions in [docs/product.md](docs/product.md)): geolocation and maps, audio ML beyond tempo and later key and genre, reputation and credits, payments, direct messages between users, live streaming, mobile apps before Phase 12, and desktop apps.

## Tech stack

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

**Domain** (see [ADR 0009](docs/decisions/0009-feedback-community-domain.md)): the app is at https://feedback.community. It's the one deployed environment; the tooling calls it staging, but a separate staging and production cost too much for now (decided 2026-10-20).

**Pinned versions** (see [ADR 0001](docs/decisions/0001-runtime-and-toolchain-versions.md) and [0005](docs/decisions/0005-node-24.md)): Node 24 LTS (`.nvmrc`; Vercel doesn't support 26 yet), pnpm 12 (installed via `npm i -g pnpm`, not corepack, which Node 25+ drops), TypeScript 6.0 (typescript-eslint doesn't support 7 yet), ESLint 9 (eslint-config-next isn't ready for 10). API and worker have no build step: Node runs `.ts` directly via type stripping, so use only erasable TS syntax (no `enum`/`namespace`) and `.ts` extensions in relative imports.

If a choice above becomes painful, propose an alternative and record it in `docs/decisions/` as a short ADR before switching.

**Auth** ([ADR 0002](docs/decisions/0002-auth-provisioning.md)): users are created as `pending` on their first authenticated API request; the Clerk session token carries an `email` claim. The web app reads its env from `apps/web/.env.local`, not the root `.env`.

**Domain** ([ADR 0009](docs/decisions/0009-feedback-community-domain.md)): the app is at https://feedback.community. It's the one deployed environment; the tooling calls it staging (decided 2026-10-20).

**Pinned versions** ([ADR 0001](docs/decisions/0001-runtime-and-toolchain-versions.md), [0005](docs/decisions/0005-node-24.md)): Node 24 LTS (`.nvmrc`), pnpm 12 (via `npm i -g pnpm`, not corepack), TypeScript 6.0, ESLint 9. API and worker have no build step: Node runs `.ts` directly via type stripping, so use only erasable TS syntax (no `enum`/`namespace`) and `.ts` extensions in relative imports.

## Repo layout

```
.
├── CLAUDE.md
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
├── apps/
│   ├── web/            # Next.js app (PRODUCT.md and DESIGN.md here are Impeccable design context; CLAUDE.md and docs/ win on conflicts)
│   ├── api/            # Fastify HTTP API
│   ├── worker/         # BullMQ consumers (ffmpeg pipeline)
│   └── mobile/         # Expo app (Phase 12, not yet created)
├── packages/
│   ├── db/             # Drizzle schema, migrations, seed, query helpers
│   ├── shared/         # zod schemas, shared types, constants, API client
│   ├── authz/          # canAccess() and permission logic (pure, heavily tested)
│   └── config/         # shared tsconfig, eslint config
└── docs/
    ├── *.md            # the spec, split by area (see Docs, above)
    ├── decisions/      # ADRs
    └── learning/       # owner's study notes (not a spec; don't rely on them)
```

**Rules**

- `packages/authz` has **no I/O**. It takes already-loaded data and returns a decision. This keeps it trivially testable.
- `apps/web` and future `apps/mobile` talk to the API only through the typed client in `packages/shared`. They never import from `packages/db`.
- Validation schemas live in `packages/shared` and are used by both API and clients.

- `packages/authz` has **no I/O**. It takes already-loaded data and returns a decision.
- `apps/web` and future `apps/mobile` talk to the API only through the typed client in `packages/shared`, never `packages/db`.
- Validation schemas live in `packages/shared` and are used by both API and clients.

## Commands

Every developer command (services, migrations, seeding, admin tasks, tests) is a script in the root `package.json`, so `pnpm <script>` is the only interface. Don't document raw `docker`, `node`, or tool commands; wrap them in a script first, and keep this list accurate. Env files, local URLs, and test databases: [docs/development.md](docs/development.md).

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

Before saying a task is done: `pnpm lint && pnpm typecheck && pnpm test` must pass.

## Non-negotiables

The short version; the full rules are in [docs/permissions.md](docs/permissions.md) and [docs/conventions.md](docs/conventions.md).

- **All authorization goes through `canAccess` / `canAccessFeedback`** in `packages/authz`. Every route validates input with zod, calls `canAccess`, then does the work, in that order. No ad-hoc permission checks in handlers or UI.
- **Private by default.** Someone who can't see a non-public resource gets a `404`, never a `403`.
- **Audio, covers, and pictures only through short-lived signed URLs** (10 minutes), issued after `canAccess`. Originals never reach non-owners.
- **Share-link tokens** are stored hashed, travel in the `x-share-token` header, and live in the URL fragment, never a query string.
- **Any permission change updates the table-driven tests in the same commit.** A permissions bug is a P0.
- **Never log or send to monitoring** tokens, signed URLs, share-link tokens, or audio.
- **Database changes only via migrations** (`pnpm db:generate`), expand first and contract later, so the running release keeps working.
- **Worker jobs are idempotent**, and nothing transcodes in a request handler.

## Roadmap and workflow

The phases, the backlog, and open questions are in [docs/plan.md](docs/plan.md). Read the current phase there before starting work, and keep it current: tick items as they ship, and record decisions in the phase they belong to.

- Work **one phase at a time**. Don't start a phase until the previous one's checklist is complete and I've confirmed; start each with a short task breakdown for approval.
- **All work happens on a short-lived feature branch off `main`**, named `<type>/<slug>` with the conventional-commit type (`feat/presigned-uploads`, `fix/me-route-gate`), and lands through a reviewed PR. Never commit to `main`.
- **A phase is usually several PRs**, each one coherent slice. Every merge to `main` deploys, so each PR leaves `main` working; hide unfinished features (an unlinked route or a flag) rather than holding them on a long-lived branch.
- **Every PR has a detailed description:** Summary (what and why, which phase), What changed (by area: db, api, web, tooling, docs; new dependencies and why), Decisions (anything that differs from the docs or the approved plan, new ADRs), How to test (exact `pnpm` commands and manual steps), and Checklist (the phase items it completes and what's left). Keep it current as commits land.

## How to work with me (Claude Code)

- **Plan before coding** on anything non-trivial: summarize the approach and affected files, then wait for a go-ahead.
- Make **small, reviewable changes**. Prefer several focused PRs/commits over one giant one.
- **Schema and authz first.** Show me migrations and `canAccess` changes before building UI on top of them.
- **No styling beyond the surfaces listed in [docs/frontend.md](docs/frontend.md)** (the player, header, home, your tracks, track, project, profile, public profile, and notifications pages). Everything else is plain semantic HTML until I ask.
- **Write tests with the code**, and run `pnpm lint && pnpm typecheck && pnpm test` before declaring done.
- Don't add dependencies without saying why. Prefer well-maintained, widely used packages.
- Don't build anything from the out-of-scope list.
- If requirements are ambiguous, ask a specific question rather than guessing.
- `docs/learning/` holds my personal study notes. They aren't a source of truth: don't use them to decide anything, and don't update them unless I ask.
