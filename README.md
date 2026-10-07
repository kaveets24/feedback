# Feedback

> A social app for sharing unfinished music: upload rough song ideas, organize them into projects, control exactly who can hear them, and collect feedback pinned to specific moments in a track.

**Status:** Phase 0 (foundation) is complete: the web app, API, worker, and database run locally, with Clerk sign-in and the invite-only approval gate. Phase 1 (staging and continuous delivery) is in progress; uploads arrive in Phase 2. See [CLAUDE.md](CLAUDE.md) for the full product spec, architecture, and roadmap.

## Access: invite only

Feedback launches as an **invite-only** service. Anyone can sign up, but a new account stays **pending** until an admin approves it by hand. Until then, the user only sees a "you're on the list" screen and can't upload, listen, or comment. Approved users get full access. Admins can also reject accounts.

## Getting started

### Prerequisites

| Tool                                                                                                  | Version           | Install                                                             |
| ----------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| [Node.js](https://nodejs.org)                                                                         | 26 (see `.nvmrc`) | `nvm install && nvm use` (via [nvm](https://github.com/nvm-sh/nvm)) |
| [pnpm](https://pnpm.io)                                                                               | 12                | `npm i -g pnpm` (Node 26 no longer ships corepack)                  |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [OrbStack](https://orbstack.dev) | latest            | Open the app once so the `docker` CLI is on your `PATH`             |

From Phase 2 onward you'll also need **ffmpeg** for the audio worker: `brew install ffmpeg`.

### Run it locally

```bash
git clone <repo-url> && cd feedback
nvm use                      # switch to Node 26
pnpm install
pnpm env:init                # creates .env and apps/web/.env.local
                             # then add your Clerk keys (see below)
pnpm services:up             # Postgres + Redis in Docker
pnpm db:migrate              # create tables
pnpm db:seed                 # optional sample users
pnpm dev                     # web + api + worker
```

### Clerk setup (once)

Sign-in uses [Clerk](https://clerk.com). In your Clerk application's dashboard:

1. **API Keys:** copy the publishable key (`pk_test_…`) and secret key (`sk_test_…`).
   - Root `.env`: set `CLERK_SECRET_KEY`.
   - `apps/web/.env.local`: set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
2. **Sessions → Customize session token:** add `{ "email": "{{user.primary_email_address}}" }`.
   The API reads the user's email from the token.

The API and web app refuse to start if these keys are missing or malformed.

Then open:

- **Web:** http://localhost:3000
- **API health check:** http://localhost:4000/v1/health
- **OpenAPI spec:** http://localhost:4000/v1/openapi.json

Stop the dev servers with `Ctrl+C`, and the containers with `pnpm services:down` (`pnpm services:reset` also wipes their data).

## Common commands

```bash
pnpm dev            # run web, api, and worker with hot reload
pnpm lint           # ESLint across all packages
pnpm typecheck      # tsc across all packages
pnpm test           # Vitest across all packages
pnpm format         # Prettier (CI runs `pnpm format:check`)
pnpm services:up    # start Postgres + Redis (services:down, services:reset, services:logs)
pnpm db:migrate     # apply migrations
pnpm db:generate    # generate a migration from schema changes
pnpm db:seed        # load dev sample data
```

Before opening a PR: `pnpm lint && pnpm typecheck && pnpm test` must pass. CI runs the same checks.

## Repo layout

```
apps/
  web/        Next.js (App Router) + Tailwind
  api/        Fastify HTTP API, routes under /v1
  worker/     background jobs (audio processing, from Phase 2)
packages/
  db/         Drizzle schema, migrations, seed, query helpers
  shared/     zod schemas and types shared by API and clients
  authz/      permission logic (pure functions, no I/O)
  config/     shared tsconfig and ESLint config
docs/
  decisions/  architecture decision records (ADRs)
```

## Good to know

- **No build step for the API and worker.** Node 26 runs TypeScript directly, so use only type-erasable syntax (no `enum` or `namespace`) and include the `.ts` extension in relative imports. Details in [ADR 0001](docs/decisions/0001-runtime-and-toolchain-versions.md).
- **Environment variables** are validated at startup; the app refuses to start if any are invalid. Add new ones to `.env.example` and to the relevant `env.ts`.
- **Never commit secrets.** `.env` is gitignored.
