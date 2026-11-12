# Permissions and privacy

> The most important doc in the repo: visibility, roles, the privacy rules, the approval gate, and the tests they need. "Rule N" anywhere in the docs means a rule in this file. Linked from [CLAUDE.md](../CLAUDE.md); keep it current when a decision changes.

## Visibility levels

Applied to projects (and optionally overridden per track):

- `private`: owner only. Share links do nothing: making something private shuts its links off without revoking them
- `unlisted`: anyone holding an active share link
- `public`: anyone; appears on profile and in discovery

## Roles

- `owner`: full control
- `listener`: anyone else who can see it (by visibility or a share link): view and listen, and read and write comments if signed in. **If you can see it, you can give feedback on it** (decided 2026-10-20; links used to carry a `listen` or `comment` role)

## Rules

1. **Default is `private`.** New projects and tracks are private unless the user changes it.
2. **All authorization goes through `canAccess(actor, resource, action)` in `packages/authz`.** No route handler or UI component makes its own ad-hoc permission decisions.
3. Actions: `view`, `listen`, `comment`, `manage`, `download`.
4. **Downloads are off by default** and require an explicit per-project setting. Never expose original files to non-owners. Until that setting exists (it's not part of Phase 4), only the owner can download.
5. **Audio is served via short-lived signed URLs** (target: 5 to 15 minutes). The API issues a signed URL only after `canAccess(..., 'listen')` passes. Never return permanent public URLs for non-public audio.
6. Share links: unguessable (at least 128 bits of entropy), stored hashed, support expiry and revocation. Revoking takes effect immediately. A link never makes anyone an owner, and is made for a track or a project; a project's link reaches only those of its tracks that aren't private (decided 2026-10-20). Tokens are 32 random bytes (base64url) and travel in the `x-share-token` request header, never a query string; the API hashes and looks up the link on every request (`apps/api/src/auth/share-link.ts`), so revoking takes effect on the next one. A malformed or unknown token is ignored, not refused. A share URL is `/listen#<token>`: the token sits in the fragment, which browsers never send to a server, so it stays out of request logs and referrers; a project's link reaches one of its tracks at `/listen#<token>/<trackId>`, the same way, which is where that track's comments are (decided 2026-11-06). The page reads it in the browser and opens the link through server actions that call the API with only the token, never the visitor's session (`sharedApi()` in `apps/web/lib/api.ts`), so a link works the same for everyone who holds it. Comments are the one exception, since a comment needs an author: an approved, signed-in visitor's comment calls carry their session as well as the token (`sharedApiAs()`), and signing in on the listen page is a Clerk modal, so the link never leaves the fragment (decided 2026-10-21). The web app turns off Next's dev logging of server action arguments for the same reason.
7. A track inherits its project's visibility unless `visibility_override` is set. An override can only be **more restrictive** than the project unless the owner explicitly widens it. A loose track (no project) uses its own `visibility`; a project track's own `visibility` is ignored (`effectiveVisibility()`). **Moving a track never widens who can hear it:** joining a project with a wider visibility gives the track an override at its old visibility (`overrideOnJoin()`), and leaving a project sets its own `visibility` to the effective one it had (decided 2026-10-20).
8. Everyone signed in who can see a track can read all of its comments (signed-in only since 2026-11-05); there are no private or artist-only comments (decided 2026-10-21). Listing a version's comments is `canAccess(..., 'comment')` on the track, and a signed-out visitor who can see the track gets a `401`. Decisions about one comment go through `canAccessFeedback(actor, track, feedback, action)` in `packages/authz`, which gives anonymous actors nothing and first requires `canAccess(..., 'view')` on the track: losing access to a track (a revoked link, say) takes away its comments too, your own included. Its actions: `read`; `reply` (may comment on the track); `edit` (the author only); `delete` (the author, or the track owner); `resolve` and reopen (the track owner only).
9. Unauthenticated access to a non-public resource returns `404`, not `403`, to avoid leaking existence.
10. Deleting a project or track revokes all share links and invalidates outstanding signed URLs as soon as practical. Today that's when they expire: the API refuses new stream URLs at once, but one already issued keeps working until its 10 minutes run out (the same holds after revoking a link or making something private).
11. Comments need an account, to read them as well as to write them: anonymous visitors, with a link or on something public, can view and listen only, and so can accounts the approval gate refuses (pending or rejected). They still see the artist's feedback prompt, which isn't a comment. There are no guest comments.
12. **Listeners see finished work only.** Anyone but the owner gets only `ready` versions (others are a 404), never file names, the track's own notes, or cover upload progress, and a track's `project_id` only if they may view that project. Owner-only details are decided with `canAccess(..., 'manage')` (`canManage()` in `apps/api/src/auth/authz.ts`).

## Invite-only access (launch mode)

The service starts invite only. Anyone can create an account, but it stays `pending` until an admin approves it by hand.

- The approval gate lives in **our** `users.access_status`, not in the auth provider, so it survives swapping `AuthPort`.
- The API's auth plugin checks it: non-approved users get `403` with code `ACCOUNT_PENDING` (or `ACCOUNT_REJECTED`) on every route except `GET /v1/me`, which reports their status. Anonymous access to public or link-shared resources is unaffected.
- The web app shows a plain "you're on the list" screen to pending users.
- Admin approval starts as a CLI script (`pnpm admin:approve <email>` / `admin:reject`) that records `approved_at` and `approved_by`. An admin UI comes later if the queue gets big.
- Gate tests cover pending, approved, and rejected users on a protected route and on `/v1/me`.
- The gate is a root `onRequest` hook (`apps/api/src/auth/gate.ts`) that runs right after auth, so it covers every route by default. A route opts out only with `config: { allowUnapproved: true }` (today: `/v1/me`, `/v1/health`, `/v1/openapi.json`).

## Testing requirement

`packages/authz` must have exhaustive table-driven tests covering every combination of visibility x action x (owner / link-holder / stranger / anonymous), and for feedback, action x (artist / author / other listener / anonymous) at every track visibility, with and without a link. Any change to permission logic requires test updates in the same commit. Treat a permissions bug as a P0.
