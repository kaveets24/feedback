# 0003: Staging hosting, deploys, and monitoring

- **Status:** accepted
- **Date:** 2026-10-07

## Context

Phase 1 puts the app on a staging environment that every merge to `main` deploys to
automatically. Staging should use the providers we expect to use in production, so it doubles
as a rehearsal for the production deploy in Phase 7. CLAUDE.md listed Fly.io or Railway for the
API and worker and left the monitoring vendor open.

## Decision

**Hosting**

| Piece        | Staging choice                                                                     |
| ------------ | ---------------------------------------------------------------------------------- |
| Web          | Vercel project for staging, deployed from CI (automatic Git deploys of `main` off) |
| API + worker | One Fly.io app, `feedback-staging`, with `api` and `worker` process groups         |
| Postgres     | Neon project `feedback-staging`, same region as the Fly app                        |
| Redis        | None yet; added in Phase 2 when the worker gets its first queue                    |
| Auth         | A separate Clerk application for staging, with the same `email` session claim      |
| Domains      | Platform domains (`*.vercel.app`, `*.fly.dev`) until we buy a domain               |

- **Fly.io over Railway** because Fly deploys a prebuilt image (`fly deploy --image`), which
  fits "build once, promote the same image", and its `release_command` runs migrations in a
  one-off machine before new code starts, failing the deploy if they fail.
- **One Fly app, two process groups.** The API and worker share one image and one release, so
  they never run mismatched versions, and each group still scales on its own.
- **Region:** Fly and Neon in the same region, chosen at setup (default: US East, Fly `iad`,
  Neon `aws-us-east-1`).
- **Direct Neon connections, not the pooler.** Neon's pooler runs PgBouncer in transaction mode,
  which needs prepared statements turned off in postgres.js. At staging scale direct connections
  are fine; revisit if connection counts become a problem.

**Images and deploys**

- CI builds **one image per commit** for the API and worker and pushes it to GitHub Container
  Registry (GHCR), tagged with the commit SHA. GHCR is the source of truth.
- The repo is private, so its GHCR packages are private and Fly can't pull them directly. The
  deploy job copies the image **by digest** to Fly's registry and deploys that, so what runs is
  byte-for-byte what CI built and tested.
- The web app is the exception: Next.js inlines `NEXT_PUBLIC_*` values at build time, so Vercel
  builds it per environment. What's promoted is the same commit, not the same artifact.
- Deploy order on every merge to `main`, after CI passes: migrate (Fly `release_command`), API
  and worker, web, then a smoke test. Any failure stops the pipeline.
- **Secrets:** runtime secrets live in Fly secrets and Vercel environment variables. GitHub only
  holds deploy credentials (a Fly deploy token scoped to the app, a Vercel token), in a
  `staging` GitHub Environment.

**Monitoring**

- **Sentry** (free tier) for errors in web, API, and worker: three projects, one per app.
  Auth headers, cookies, and query strings are scrubbed before sending.
- **Better Stack** (free tier) for uptime checks on `/v1/health` and the web home page, log
  search, and alerts. Fly logs are shipped to it. Web logs stay in Vercel's dashboard if
  shipping them needs a paid Vercel plan.
- No OpenTelemetry tracing yet. Logs stay as pino JSON on stdout, so adding OTel or changing
  vendors later doesn't touch application code.

## Consequences

- Staging costs a few dollars a month (two small Fly machines); Neon, Sentry, Better Stack, and
  Clerk start on free tiers. Vercel's Hobby plan is for non-commercial use, so production will
  likely need Vercel Pro.
- Preview deploys get a different URL per PR, so the API's single `WEB_ORIGIN` check needs to
  accept preview origins before previews can sign in (a separate Phase 1 PR).
- The idle worker costs money before it does anything. We accept that so the deploy pipeline
  covers all three processes from the start.
- Production (Phase 7) gets its own Fly app, Neon project, Clerk instance, and Vercel
  environment, and deploys images that have already passed staging.
