# 0006: Logs and uptime on Sentry instead of Better Stack

- **Status:** accepted (supersedes the Better Stack part of [0003](0003-staging-hosting-and-monitoring.md))
- **Date:** 2026-10-13

## Context

ADR 0003 put errors on Sentry and uptime checks, log search, and downtime alerts on Better
Stack. Sentry is now live for the api, worker, and web app. Getting Fly logs into Better Stack
needs a log shipper: a separate always-on Fly app that subscribes to the org's log stream and
forwards it (about $2 a month). That's a second vendor account and another machine for staging,
where log volume is a few MB a month.

Sentry's free Developer plan already includes 5 GB of logs a month (30-day lookback) and one
uptime monitor. Fly also has built-in log search (free while in beta, 7 days of history).

## Decision

- **Logs go to Sentry** through `Sentry.pinoIntegration()` in the api and worker. It listens on
  the diagnostics channel pino publishes, so it picks up Fastify's logger without a preload.
  Only `info` and above are sent; `debug` and `trace` stay on stdout.
- **pino still writes JSON to stdout.** Sentry gets a copy, so Fly's log search works as a
  fallback, and switching vendors means replacing one integration, not touching log calls.
- **Before sending**, `scrubLog` (`packages/shared/src/monitoring.ts`) flattens nested fields
  (`req.url`, `res.statusCode`) so they're searchable, and strips query strings from URL-like
  attributes. The api's request log serializer already drops query strings at the source, for
  stdout too.
- **One uptime monitor** on the api's `/v1/health`, emailing on failure. The web home page has no
  monitor of its own: the free plan allows one, Vercel serves it, and every deploy's smoke test
  loads it.
- Web app logs stay in Vercel's dashboard.

## Consequences

- Errors, logs, and downtime alerts are in one tool, and errors link to the log lines around them.
- No extra machine or vendor account for staging.
- If staging and production together outgrow 5 GB a month, Sentry stops accepting logs until the
  month resets; it doesn't charge unless a pay-as-you-go budget is set. Fly's log search still
  has everything from the last 7 days.
- Production (Phase 7) needs its own uptime monitor, which is a second monitor and beyond the free
  plan. Decide then between a paid Sentry monitor and a free uptime service.
- Revisit if we need longer log retention, log-based metrics, or more monitors than the free tier
  covers.
