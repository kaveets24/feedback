# 0009: The app lives at feedback.community

- **Status:** accepted (replaces the platform-domains row in [0003](0003-staging-hosting-and-monitoring.md))
- **Date:** 2026-10-20

## Context

The web app was served at `feedback-six-kappa.vercel.app`, and the staging Clerk application's
production instance worked there only through Clerk's automatic `/__clerk` proxy, which
`@clerk/nextjs` turns on just for `*.vercel.app` production hosts.

We bought `feedback.community` (DNS on Cloudflare). There's only one deployed environment:
running a separate staging and production costs too much for now. The tooling calls it
"staging" (the Fly app, the GitHub Environment, the workflow), but it's the live app.

## Decision

- **The web app is served at `https://feedback.community`.** The old `vercel.app` address
  redirects to it (a Vercel domain redirect, which keeps the path, so old links still work). The
  API stays at `https://feedback-staging.fly.dev`: browsers never call it (the web server does),
  so its address isn't user-facing.
- **Clerk runs on the domain itself:** the Clerk production instance's domain is
  `feedback.community`, with Clerk's DNS records in Cloudflare (DNS only, not proxied). The
  `/__clerk` proxy isn't used any more, and the middleware no longer matches it.
- `WEB_ORIGIN` (the API's `authorizedParties` check), the B2 bucket's CORS rule, and the deploy
  smoke tests use the new origin.
- Names stay as they are: renaming the Fly app, Neon branch, GitHub Environment and docs from
  "staging" to "production" is churn with no effect.
- It stays out of search engines (`ALLOW_INDEXING` unset) until there are public pages worth
  finding.

## Consequences

- Share links, sign-in, and uploads all use one origin we own, which survives a change of host.
- Phase 7's "production environment" item no longer means a second copy of everything; revisit
  it then (a cheaper staging, or none).
- Previews still run on their own `vercel.app` URLs with the development Clerk instance
  ([0007](0007-signed-out-previews.md)), so nothing changes for them.
