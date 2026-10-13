# 0007: Preview deploys are signed out

- **Status:** accepted (replaces the preview sign-in plan in [0003](0003-staging-hosting-and-monitoring.md))
- **Date:** 2026-10-13

## Context

Vercel builds a preview of the web app for every PR, at its own `*.vercel.app` URL, pointed at
the staging API. ADR 0003 planned to let previews sign in by having the API accept preview
origins as well as `WEB_ORIGIN`.

That isn't enough. Staging uses a Clerk production instance, and a production instance only
works on its one domain (`feedback-six-kappa.vercel.app`, through the `/__clerk` proxy). Making
previews sign in would mean one of:

- giving previews a Clerk development instance (which works on any domain) and having the staging
  API trust tokens from both instances. Preview sign-ins would be separate Clerk users, so an
  email already used on staging hits the `users.email` unique constraint;
- moving all of staging to a development instance, so staging stops rehearsing the production
  Clerk setup.

Right now nearly every page needs a signed-in, approved user, so a signed-out preview shows
little. But previews still catch build and render failures before merge, and public pages
(share-link listen pages in Phase 4, public profiles in Phase 6) are exactly what a signed-out
preview is for.

## Decision

- **Previews are signed out.** They use the staging Clerk application's **development**
  instance, so Clerk loads on any preview URL. The staging API only trusts the production
  instance, and `WEB_ORIGIN` stays a single origin, so a preview sign-in never reaches the API.
- Previews never use local dev keys or the staging production keys. Their env vars are set for
  Vercel's Preview environment only (see `docs/staging.md`).
- Preview errors go to the `feedback-web` Sentry project with environment `preview`.
- A `Preview` workflow waits for each PR's preview and loads its home page through Vercel's
  protection bypass, so a broken preview fails a check on the PR.

## Consequences

- Signed-in flows are tested locally and then on staging after merge, as today.
- Previews show the signed-out home page. They get more useful once public pages exist.
- The staging API's auth config doesn't change, so it trusts nothing new.
- Revisit in Phase 4 if reviewing share-link or listen flows in previews needs a signed-in user,
  or in Phase 7 if staging moves to a domain we own (Clerk satellite domains become an option).
