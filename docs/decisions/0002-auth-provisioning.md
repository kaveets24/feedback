# 0002: Auth provisioning and session tokens

- **Status:** accepted
- **Date:** 2026-10-06

## Decision

- **Users are created on first authenticated request**, not by Clerk webhooks. The API's auth
  hook (`apps/api/src/auth/plugin.ts`) verifies the bearer token and upserts a `pending` user
  keyed by `auth_provider_id`. No public webhook endpoint is needed for local dev, and our
  `users` row stays the source of truth for access status.
- **Email comes from a custom session-token claim.** The Clerk session token is configured
  (Dashboard → Sessions → Customize session token) to include
  `{ "email": "{{user.primary_email_address}}" }`, so verifying a request needs no call to
  Clerk's API. If the claim is missing, the API fails loudly with instructions.
- **Clerk stays behind `AuthPort`** (`apps/api/src/auth/port.ts`). Only `auth/clerk.ts` imports
  `@clerk/backend`. Tests use a fake `AuthPort` and never touch Clerk.
- **Tokens are checked against `WEB_ORIGIN`** (`authorizedParties`), so tokens issued to other
  origins are rejected.
- **`GET /v1/me` returns 401 for anonymous requests.** Signed-in users of any access status get
  their record, including `accessStatus`.

## Consequences

- Email changes in Clerk reach our `users` table on the user's next request, not instantly.
- Deleting a user in Clerk doesn't delete ours; account deletion is handled in Phase 6.
- The mobile app (Phase 7) will send the same bearer token; nothing here is web-specific.
