# Staging

Staging runs the same providers planned for production ([ADR 0003](decisions/0003-staging-hosting-and-monitoring.md)).
It holds no real user data, is invite-only (the approval gate), and is kept out of search engines.

| Piece        | Where                                                                            |
| ------------ | -------------------------------------------------------------------------------- |
| Web          | Vercel project `feedback-staging`, https://feedback-staging.vercel.app           |
| API + worker | Fly app `feedback-staging` (`api` and `worker` process groups), `iad`            |
| Postgres     | Neon project `feedback` (`bold-feather-90292757`), branch `production`           |
| Auth         | Clerk application "Feedback Staging" (separate from dev and production)          |
| Images       | `ghcr.io/kaveets24/feedback-server:<sha>`, copied to `registry.fly.io`           |
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
| `NODE_ENV`, `LOG_LEVEL`, `API_*`, `WEB_ORIGIN`   | `fly.staging.toml`         | Not secret                                                                                         |
| `FLY_API_TOKEN`                                  | GitHub `staging` secret    | Deploy token scoped to the Fly app                                                                 |
| `VERCEL_TOKEN`                                   | GitHub `staging` secret    | Vercel access token                                                                                |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`             | GitHub `staging` variables | From the Vercel project settings                                                                   |

`ALLOW_INDEXING` is never set on staging. The API and worker validate their env at startup,
same as locally, so a missing or malformed secret fails the deploy's health check.

## One-time setup

How staging was provisioned, for reference and for the production setup in Phase 7.

1. **Neon:** project `feedback` in `aws-us-east-2`. Its connection string (direct, not pooled)
   became the Fly `DATABASE_URL` secret.
2. **Clerk:** a new application, "Feedback Staging", with the same session token customization
   as dev: Sessions → Customize session token → `{ "email": "{{user.primary_email_address}}" }`.
3. **Fly:** app `feedback-staging` created in the personal org; secrets set; a deploy token
   (`fly tokens create deploy`, named "github-actions staging") stored as the GitHub `FLY_API_TOKEN`
   secret. It expires 2027-10-12: create a new one and replace the secret before then.
4. **Vercel:** project `feedback-staging` imported from the GitHub repo with root directory
   `apps/web`; env vars from the table above for the Production environment; an access token
   and the project's org and project IDs stored in the GitHub `staging` environment.
5. **First deploy:** merge to `main` (or `pnpm staging:deploy <sha>`), then sign in on staging and
   approve yourself with `pnpm admin:approve` pointed at the staging database.
