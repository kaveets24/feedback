# Development

> Env files, local URLs, and test databases. The commands themselves are in [CLAUDE.md](../CLAUDE.md); staging is in [staging.md](staging.md).

## Env vars

Each app reads its own env file (`.env` for api, worker, and db scripts; `apps/web/.env.local` for web). Turbo runs tasks in strict env mode, so a var exported only in your shell (e.g. `FOO=1 pnpm dev`) never reaches the app; put it in the env file. `turbo.json` declares only what the web build reads from the process env on Vercel (see the comment there).

## Local URLs

Web http://localhost:3000, API http://localhost:4000 (`/v1/health`, `/v1/health/queue`, `/v1/openapi.json`), pgweb http://localhost:8081 (browses the `feedback` database; its connect screen can switch to a `feedback_test_*` database), object storage (S3 API) http://localhost:8333 with a file browser at http://localhost:8888/buckets/.

## Tests

DB tests use a `feedback_test_<package>` database per package on the compose Postgres, created and migrated automatically by each package's vitest global setup; point `TEST_DATABASE_URL` at a different server to override. Worker tests run real ffmpeg, so install it locally (`brew install ffmpeg`); CI installs it, and the server image has its own static build. The e2e suite (`pnpm test:e2e`, Playwright) comes in Phase 7.
