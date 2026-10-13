# Staging

Staging runs the same providers planned for production ([ADR 0003](decisions/0003-staging-hosting-and-monitoring.md)).
It holds no real user data, is invite-only (the approval gate), and is kept out of search engines.

| Piece        | Where                                                                            |
| ------------ | -------------------------------------------------------------------------------- |
| Web          | Vercel project `feedback`, https://feedback-six-kappa.vercel.app                 |
| API + worker | Fly app `feedback-staging` (`api` and `worker` process groups), `iad`            |
| Postgres     | Neon project `feedback` (`bold-feather-90292757`), branch `production`           |
| Auth         | Clerk application "Feedback Staging" (separate from dev and production)          |
| Images       | `ghcr.io/kaveets24/feedback-server:<sha>`, copied to `registry.fly.io`           |
| Errors       | Sentry projects `feedback-server` (api + worker) and `feedback-web`              |
| Deploy creds | GitHub Environment `staging` (only deploy tokens; app secrets stay in the hosts) |

## How a deploy works

Every push to `main` runs CI (`.github/workflows/ci.yml`). If `check` and `image` pass, the
`deploy-staging` job calls `.github/workflows/deploy-staging.yml` with the commit SHA:

1. **api job:** copies that commit's image from GHCR to Fly's registry (digests must match), then
   `flyctl deploy --config fly.staging.toml --image ...`. Fly runs migrations in a one-off machine
   first (`release_command`); if they fail, nothing is replaced. Then it replaces the api and worker
   machines and waits for the api health check. Finally CI calls `/v1/health`.
2. **web job:** runs `vercel deploy --prod`. Vercel builds the web app at that commit with the
   staging project's env vars and points the staging domain at it. CI then loads the home page and
   checks it sends `X-Robots-Tag: noindex`.

Any failed step fails the workflow and stops later steps. Deploys never run from a laptop.

Vercel's own Git deploys of `main` are off (`apps/web/vercel.json`), so the web app only reaches
staging through this workflow, after the API it talks to.

## Rollback

```bash
pnpm staging:deploy <sha>
```

This starts the same workflow for an earlier commit on `main`, redeploying the image CI built
for it (and the web app at that commit). Pick the last good commit from `git log origin/main`.
Migrations are not rolled back; they're written to work with the previous release (CLAUDE.md
section 10), so the older code runs against the newer schema.

## Secrets and config

App secrets live in the hosts. GitHub only holds what it needs to deploy.

| Name                                             | Where                      | Notes                                                                                              |
| ------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                   | Fly secret                 | Neon **direct** connection string, `?sslmode=require` only (postgres.js rejects `channel_binding`) |
| `CLERK_SECRET_KEY`                               | Fly secret, Vercel env var | Staging Clerk app                                                                                  |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`              | Vercel env var             | Staging Clerk app                                                                                  |
| `API_URL`                                        | Vercel env var             | `https://feedback-staging.fly.dev`                                                                 |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL` | Vercel env var             | `/sign-in`, `/sign-up`                                                                             |
| `ENABLE_EXPERIMENTAL_COREPACK`                   | Vercel env var             | `1`, so Vercel uses the pnpm in `packageManager` (ADR 0005)                                        |
| `SENTRY_DSN`                                     | Fly secret                 | `feedback-server` project's DSN, shared by api and worker (events carry a `service` tag)           |
| `NEXT_PUBLIC_SENTRY_DSN`                         | Vercel env var             | `feedback-web` project's DSN; public by design (it only lets clients send events)                  |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT`                 | Vercel env var             | `staging`                                                                                          |
| `NODE_ENV`, `LOG_LEVEL`, `API_*`, `WEB_ORIGIN`   | `fly.staging.toml`         | Not secret; so is `SENTRY_ENVIRONMENT=staging`                                                     |
| `GIT_SHA`                                        | Baked into the image       | The commit CI built it from; tags error reports with their release                                 |
| `FLY_API_TOKEN`                                  | GitHub `staging` secret    | Deploy token scoped to the Fly app                                                                 |
| `VERCEL_TOKEN`                                   | GitHub `staging` secret    | Vercel access token                                                                                |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`             | GitHub `staging` variables | From the Vercel project settings                                                                   |

`ALLOW_INDEXING` is never set on staging. The API and worker validate their env at startup,
same as locally, so a missing or malformed secret fails the deploy's health check.

## Error reporting

Sentry gets unexpected errors from all three apps: 5xx responses and crashes in the api,
uncaught errors in the worker, and server render errors and uncaught browser errors in the web
app. Each event is tagged with `service` (`api`, `worker`, `web`), the environment (`staging`),
and the release (the commit SHA). Sentry emails on every new issue.

Nothing secret is sent: no headers except a short allowlist, no cookies, request bodies, query
strings, or local variables. `packages/shared/src/monitoring.ts` holds the settings and scrubber
all three apps use.

Reporting is off when the DSN is unset, which is the usual local setup. To try it locally, set
`SENTRY_DSN` (api, worker) or `NEXT_PUBLIC_SENTRY_DSN` (web) to a Sentry project's DSN.

### Testing it end to end

Test errors are behind `MONITORING_TEST_ERRORS`, which is off everywhere by default. Turn it on
only while testing.

**API and worker:**

```bash
pnpm staging:test-errors on    # restarts the machines with the flag on, then calls /v1/debug/error
pnpm staging:test-errors off   # when done
```

Sentry should show "Test error from GET /v1/debug/error" (`service:api`) and "Test error from
worker startup" (`service:worker`).

**Web:** Vercel only picks up env var changes on the next deploy.

1. In the Vercel project, add `MONITORING_TEST_ERRORS=true` to the Production environment.
2. Redeploy the current commit: `pnpm staging:deploy <sha of origin/main>`.
3. Open `/debug/error` on staging. Click "Throw a server error" and, after going back, "Throw a
   browser error". Each should show up in Sentry with `service:web`.
4. Remove the env var and redeploy again (step 2), so `/debug/error` returns 404.

## Approving users

```bash
pnpm staging:admin approve <email> [--by <admin-email>]
pnpm staging:admin reject <email>
```

These run the same admin script as `pnpm admin:approve`, but inside a staging api machine over
`fly ssh`, using the deployed code and the `DATABASE_URL` secret already there. Run
`fly auth login` once first. The user must have signed in on staging at least once.

Don't point your local `.env` at the staging database to run `pnpm admin:*`: local dev would then
read and write staging data.

## One-time setup

How staging was provisioned, for reference and for the production setup in Phase 7.

1. **Neon:** project `feedback` in `aws-us-east-2`. Its connection string (direct, not pooled)
   became the Fly `DATABASE_URL` secret.
2. **Clerk:** a new application, "Feedback Staging", with the same session token customization
   as dev: Sessions → Customize session token → `{ "email": "{{user.primary_email_address}}" }`.
3. **Fly:** app `feedback-staging` created in the personal org; secrets set; a deploy token
   (`fly tokens create deploy`, named "github-actions staging") stored as the GitHub `FLY_API_TOKEN`
   secret. It expires 2027-10-12: create a new one and replace the secret before then.
4. **Vercel:** project `feedback` (team `steven-kvetons-projects`, Next.js preset) imported from the GitHub repo with root directory
   `apps/web`; env vars from the table above for the Production environment; an access token
   and the project's org and project IDs stored in the GitHub `staging` environment.
5. **Sentry:** one organization with two projects: `feedback-server` (platform Node.js, for the
   api and worker) and `feedback-web` (platform Next.js). Keep the default alert rule that
   emails on every new issue. Then set `SENTRY_DSN` as a Fly secret
   (`fly secrets set SENTRY_DSN=... -a feedback-staging`) and `NEXT_PUBLIC_SENTRY_DSN` and
   `NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging` as Vercel env vars for the Production environment.
   Production (Phase 7) uses the same projects with `environment` set to `production`.
6. **First deploy:** merge to `main` (or `pnpm staging:deploy <sha>`), then sign in on staging and
   approve yourself with `pnpm staging:admin approve <email>`.
7. **Scale:** the first `flyctl deploy` creates two api machines and a worker with a standby.
   Staging runs one of each: `fly scale count api=1 worker=1 -a feedback-staging`. Deploys keep
   that count.

## Troubleshooting

**`PR04 could not find a good candidate` / `PR01 no known healthy instances`:** the Fly proxy has
no running api machine. Check `fly status -a feedback-staging`. A deploy updates stopped machines
but doesn't start them, so once they stop (for example, when Fly's trial limit stopped them before
billing was set up) they stay stopped across deploys. The api starts on the next request
(`auto_start_machines`); start the worker with `fly machine start <id> -a feedback-staging`.
