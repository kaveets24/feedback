# Staging

Staging runs the same providers planned for production ([ADR 0003](decisions/0003-staging-hosting-and-monitoring.md)).
It holds no real user data, is invite-only (the approval gate), and is kept out of search engines.

| Piece        | Where                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Web          | Vercel project `feedback`, https://feedback-six-kappa.vercel.app                                               |
| API + worker | Fly app `feedback-staging` (`api` and `worker` process groups), `iad`                                          |
| Postgres     | Neon project `feedback` (`bold-feather-90292757`), branch `production`                                         |
| Auth         | Clerk application "Feedback Staging" (separate from dev and production)                                        |
| Storage      | Backblaze B2 bucket `feedback-audio-staging` (private), [ADR 0008](decisions/0008-object-storage-and-queue.md) |
| Images       | `ghcr.io/kaveets24/feedback-server:<sha>`, copied to `registry.fly.io`                                         |
| Monitoring   | Sentry projects `feedback-server` (api + worker) and `feedback-web`                                            |
| Deploy creds | GitHub Environment `staging` (only deploy tokens; app secrets stay in the hosts)                               |

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

## Preview deploys

Vercel builds a preview of the web app for every PR (its Git integration skips only `main`, see
`apps/web/vercel.json`). Each preview has its own `*.vercel.app` URL, linked from the PR, and talks
to the staging API. Previews are behind Vercel's login and send `X-Robots-Tag: noindex`.

**Previews are signed out** ([ADR 0007](decisions/0007-signed-out-previews.md)). They use the
staging Clerk application's development instance, because the production instance only works on
the staging domain. The staging API doesn't trust that instance, so signing in on a preview doesn't
get you into the app. Use previews to check that a PR builds and its signed-out pages render;
check signed-in flows locally, then on staging after merge.

The `Preview` workflow (`.github/workflows/preview.yml`) waits for each PR's preview and loads its
home page, failing if the page doesn't return 200 with `noindex`. It gets past Vercel's login with
the protection bypass secret. Fork PRs don't get secrets, so for them the check is skipped.

Previews only run PR code against the staging API; they never deploy the API. If a PR changes
both, the preview shows the new web app against the API from `main`.

## Rollback

```bash
pnpm staging:deploy <sha>
```

This starts the same workflow for an earlier commit on `main`, redeploying the image CI built
for it (and the web app at that commit). Pick the last good commit from `git log origin/main`.
Migrations are not rolled back; they're written to work with the previous release (CLAUDE.md
section 10), so the older code runs against the newer schema.

To confirm what's running, check the image tag in `fly status -a feedback-staging`. GitHub's
`staging` deployment history isn't reliable for this: a run started by `pnpm staging:deploy` is
recorded under the commit at the tip of `main`, not the commit it deployed.

The drill was done on 2026-10-13: rolling back from `cf6c297` to `3c4233f` and forward again took
about 2.5 minutes each way.

## Secrets and config

App secrets live in the hosts. GitHub only holds what it needs to deploy and to check previews.
Vercel env vars are set for the **Production** environment (staging) unless a row says otherwise.

| Name                                                   | Where                      | Notes                                                                                                                                                                                   |
| ------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                         | Fly secret                 | Neon **direct** connection string, `?sslmode=require` only (postgres.js rejects `channel_binding`)                                                                                      |
| `CLERK_SECRET_KEY`                                     | Fly secret, Vercel env var | Staging Clerk app                                                                                                                                                                       |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`                    | Vercel env var             | Staging Clerk app                                                                                                                                                                       |
| `API_URL`                                              | Vercel env var             | `https://feedback-staging.fly.dev`                                                                                                                                                      |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL`       | Vercel env var             | `/sign-in`, `/sign-up`                                                                                                                                                                  |
| `ENABLE_EXPERIMENTAL_COREPACK`                         | Vercel env var             | `1`, so Vercel uses the pnpm in `packageManager` (ADR 0005)                                                                                                                             |
| `SENTRY_DSN`                                           | Fly secret                 | `feedback-server` project's DSN, shared by api and worker (events carry a `service` tag)                                                                                                |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY`  | Fly secret                 | B2 application key `feedback-staging`: this bucket only, Read and Write. Never the master key                                                                                           |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET` | `fly.staging.toml`         | Not secret. The region is the middle part of the endpoint (`s3.<region>.backblazeb2.com`)                                                                                               |
| `NEXT_PUBLIC_SENTRY_DSN`                               | Vercel env var             | `feedback-web` project's DSN; public by design (it only lets clients send events)                                                                                                       |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT`                       | Vercel env var             | `staging`                                                                                                                                                                               |
| Preview env vars                                       | Vercel env vars (Preview)  | `API_URL` and the sign-in/up URLs as above; Clerk keys from the staging app's **development** instance; `NEXT_PUBLIC_SENTRY_DSN` as above with `NEXT_PUBLIC_SENTRY_ENVIRONMENT=preview` |
| `NODE_ENV`, `LOG_LEVEL`, `API_*`, `WEB_ORIGIN`         | `fly.staging.toml`         | Not secret; so is `SENTRY_ENVIRONMENT=staging`                                                                                                                                          |
| `GIT_SHA`                                              | Baked into the image       | The commit CI built it from; tags error reports with their release                                                                                                                      |
| `FLY_API_TOKEN`                                        | GitHub `staging` secret    | Deploy token scoped to the Fly app                                                                                                                                                      |
| `VERCEL_TOKEN`                                         | GitHub `staging` secret    | Vercel access token                                                                                                                                                                     |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`                   | GitHub `staging` variables | From the Vercel project settings                                                                                                                                                        |
| `VERCEL_AUTOMATION_BYPASS_SECRET`                      | GitHub repository secret   | Vercel → Settings → Deployment Protection → Protection Bypass for Automation; lets the `Preview` check past Vercel's login                                                              |

The web project holds only what the web app reads (`apps/web/lib/env.ts` and the Sentry config).
Never add the api's vars (`DATABASE_URL`, `WEB_ORIGIN`, ...) to it: every preview build runs PR code
with them. Never give previews local dev keys or staging's production Clerk keys.

`ALLOW_INDEXING` is never set on staging or previews. The API and worker validate their env at startup,
same as locally, so a missing or malformed secret fails the deploy's health check.

## Monitoring

Everything is on Sentry's free tier ([ADR 0006](decisions/0006-monitoring-on-sentry.md)).

**Errors.** Sentry gets unexpected errors from all three apps: 5xx responses and crashes in the
api, uncaught errors in the worker, and server render errors and uncaught browser errors in the
web app. Each event is tagged with `service` (`api`, `worker`, `web`), the environment
(`staging`), and the release (the commit SHA). Sentry emails on every new issue.

**Logs.** The api and worker send their pino log lines (`info` and above) to Sentry Logs, in the
`feedback-server` project, kept for 30 days. Search them under Explore → Logs, for example
`service:api`, `res.statusCode:>=400`, or `reqId:req-1` to follow one request. Successful
`/v1/health` checks aren't logged. The same lines still go to stdout, so `fly logs -a
feedback-staging` streams them live, and the app dashboard's "Search logs in Grafana" button
searches the last 7 days. Web app logs are in the Vercel dashboard.

**Uptime.** A Sentry uptime monitor calls `https://feedback-staging.fly.dev/v1/health` and emails
when it fails. The web home page has no monitor (the free plan has one); every deploy's smoke
test loads it.

Nothing secret is sent: no headers except a short allowlist, no cookies, request bodies, query
strings, or local variables. `packages/shared/src/monitoring.ts` holds the settings and scrubbers
all three apps use; the api's request logs drop query strings before they're even written.

Reporting is off when the DSN is unset, which is the usual local setup. To try it locally, set
`SENTRY_DSN` (api, worker) or `NEXT_PUBLIC_SENTRY_DSN` (web) to a Sentry project's DSN.

### Testing error reporting end to end

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

### Testing the uptime alert

Stopping the api machine doesn't work as a test: `auto_start_machines` starts it again on the
monitor's next request. Instead, edit the uptime monitor's URL to a path that returns 404 (for
example `/v1/uptime-test`), wait for the failure email (Sentry needs a few failed checks in a
row), then set it back to `/v1/health` and wait for the resolved email.

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
   For previews: in the staging Clerk application, switch to its development instance and copy
   its API keys; set them and the other Preview env vars from the table above for the Preview
   environment only. Turn on Protection Bypass for Automation (Settings → Deployment Protection)
   and store the secret as the `VERCEL_AUTOMATION_BYPASS_SECRET` repository secret in GitHub.
5. **Sentry:** one organization with two projects: `feedback-server` (platform Node.js, for the
   api and worker) and `feedback-web` (platform Next.js). Keep the default alert rule that
   emails on every new issue. Then set `SENTRY_DSN` as a Fly secret
   (`fly secrets set SENTRY_DSN=... -a feedback-staging`) and `NEXT_PUBLIC_SENTRY_DSN` and
   `NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging` as Vercel env vars for the Production environment.
   Production (Phase 7) uses the same projects with `environment` set to `production`.
   In the `feedback-server` project, add an uptime monitor (Alerts → Create alert → Uptime
   monitor): URL `https://feedback-staging.fly.dev/v1/health`, method GET, environment
   `staging`, notify by email.
6. **Backblaze B2** (ADR 0008):
   - Account → Caps & Alerts: daily caps on storage, download bandwidth, and class B and C
     transactions (about $1/day each), so a bill can't run away.
   - Buckets → Create a Bucket: a globally unique name, files **Private**, Object Lock off. Then
     Lifecycle Settings → "Keep only the last version of the file". The bucket card shows the S3
     endpoint; it and the bucket name go in `fly.staging.toml`.
   - Application Keys → Add a New Application Key: name `feedback-staging`, access to this bucket
     only, Read and Write, no prefix. Copy the key ID and key (shown once) into Fly without
     leaving them in shell history: `fly secrets import --stage -a feedback-staging`, then type
     `STORAGE_ACCESS_KEY_ID=...` and `STORAGE_SECRET_ACCESS_KEY=...` on separate lines and press
     Ctrl-D. `--stage` waits for the next deploy instead of restarting the machines.
   - CORS: the web UI's CORS settings only cover downloads, and the app key can't change bucket
     settings, so set the rule once with the B2 CLI (`brew install b2-tools`), signed in with the
     master key and signed out after. It's the same rule `pnpm services:up` sets on SeaweedFS:

     ```bash
     b2 account authorize
     b2 bucket update --cors-rules '[{"corsRuleName":"web","allowedOrigins":["https://feedback-six-kappa.vercel.app"],"allowedOperations":["s3_get","s3_head","s3_put"],"allowedHeaders":["content-type","range"],"exposeHeaders":["content-length","content-range","etag"],"maxAgeSeconds":3600}]' feedback-audio-staging allPrivate
     b2 account clear
     ```

     Only the staging origin is allowed: previews are signed out, so they never upload. Check it
     with a preflight, which should answer with `Access-Control-Allow-Origin` (and shouldn't for
     any other origin):

     ```bash
     curl -si -X OPTIONS "https://s3.us-east-005.backblazeb2.com/feedback-audio-staging/originals/test" \
       -H "Origin: https://feedback-six-kappa.vercel.app" \
       -H "Access-Control-Request-Method: PUT" -H "Access-Control-Request-Headers: content-type"
     ```

7. **First deploy:** merge to `main` (or `pnpm staging:deploy <sha>`), then sign in on staging and
   approve yourself with `pnpm staging:admin approve <email>`.
8. **Scale:** the first `flyctl deploy` creates two api machines and a worker with a standby.
   Staging runs one of each: `fly scale count api=1 worker=1 -a feedback-staging`. Deploys keep
   that count.

## Troubleshooting

**`error starting release_command machine: ... machine failed to start, currently stopped`:** if
`fly machine status <id> -a feedback-staging` shows the release machine exited with `exit_code=0`,
migrations ran fine. The machine was slow to start and finished before `flyctl` saw it running.
Nothing was replaced, so re-run the failed job (`gh run rerun <run id> --failed`).

**`PR04 could not find a good candidate` / `PR01 no known healthy instances`:** the Fly proxy has
no running api machine. Check `fly status -a feedback-staging`. A deploy updates stopped machines
but doesn't start them, so once they stop (for example, when Fly's trial limit stopped them before
billing was set up) they stay stopped across deploys. The api starts on the next request
(`auto_start_machines`); start the worker with `fly machine start <id> -a feedback-staging`.
