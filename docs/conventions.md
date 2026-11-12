# Conventions

> API, code, delivery, and monitoring conventions. Linked from [CLAUDE.md](../CLAUDE.md); keep it current when a decision changes.

## API

- REST, JSON, versioned under `/v1`. OpenAPI generated from zod schemas.
- Auth: `Authorization: Bearer <jwt>`; verified in a Fastify plugin that populates `request.actor` (or anonymous).
- Every route: validate input with zod, call `canAccess`, then do work. In that order.
- Errors use a consistent shape: `{ error: { code, message, details? } }`.
- Pagination: cursor-based (`?cursor=&limit=`), never offset for feed-like lists.
- No business logic in route handlers beyond orchestration; put it in service modules (`apps/api/src/modules/<domain>/`).
- Each module: `routes.ts`, `service.ts`, `repo.ts`, `*.test.ts`. Queries the worker also runs (tracks, versions, and projects, whose cover art it processes) live in `packages/db` instead, and those modules have no `repo.ts`.

## Code

- TypeScript `strict: true`; no `any` without a comment explaining why.
- Prefer pure functions and explicit types at module boundaries.
- Validate at every trust boundary (HTTP input, job payloads, env vars). Env vars are parsed through a zod schema at startup; the app should fail fast if invalid.
- No secrets in the repo. `.env.example` is maintained; real values never committed.
- Database changes only via migrations (`pnpm db:generate`); never hand-edit applied migrations.
- Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). Small, focused commits.
- Log with a structured logger (pino). Never log tokens, signed URLs, or share-link tokens.
- Write tests alongside code. Prioritize: authz, audio pipeline state machine, share-link lifecycle, feedback visibility.

## Delivery and monitoring

These apply from Phase 1 on.

- **`main` is always deployable.** Every merge to `main` deploys to staging automatically. If `main` breaks, fixing or reverting it comes before anything else merges.
- **Deploys only come from CI**, never from a laptop. Build each image once and promote that same image from staging to production; never rebuild per environment. The one exception is Redis: a stock, pinned image in its own Fly app, set up once and redeployed by hand (`pnpm staging:redis:deploy`) only when its tag or flags change, like provisioning Neon or B2.
- **Migrations must work with the release that's already running** (expand first, contract in a later deploy), so a deploy or rollback never breaks the live version.
- **Monitoring starts cheap.** Datadog does the job but gets expensive quickly (per-host and per-GB pricing). Start with tools that have free or low-cost tiers, such as Sentry (errors), Grafana Cloud (logs, metrics, traces), or Better Stack (logs, uptime). Move to Datadog or similar only if we outgrow them.
- **Stay vendor-neutral.** Log JSON to stdout with pino and use OpenTelemetry for traces and metrics, so changing monitoring vendors is a config change, not a code change (same idea as `AuthPort`).
- **Never send secrets or private content to monitoring.** The logging rule above applies: no tokens, signed URLs, share-link tokens, or audio. Scrub auth headers and query strings from error reports.
