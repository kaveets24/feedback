import { z } from 'zod';
import { RESOURCE_KINDS } from '@feedback/authz';

/**
 * The request header a share link's token travels in (never the URL's query string, which ends
 * up in logs). It opens what the link was made for while the link is active.
 */
export const SHARE_TOKEN_HEADER = 'x-share-token';

/** A share token: 32 random bytes, base64url without padding (256 bits; rule 6 asks for 128). */
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/**
 * Links no longer carry a role: every link lets its holders listen, and comment if signed in
 * (2026-10-20). Responses still carry a fixed `role: 'comment'` for one release, so the web app
 * that's live while the API deploys keeps parsing them; removed in the next.
 * @deprecated
 */
const deprecatedRoleSchema = z.literal('comment');

/**
 * `POST /v1/tracks/:trackId/share-links` and `POST /v1/projects/:projectId/share-links`. A link
 * only works while what it's for is unlisted or public; on something private it does nothing
 * until that changes. `expiresAt` must be in the future; null (the default) never expires.
 */
export const createShareLinkRequestSchema = z.object({
  expiresAt: z.iso.datetime().nullable().default(null),
});
export type CreateShareLinkRequest = z.input<typeof createShareLinkRequestSchema>;

/** A share link as its owner sees it. The token is never shown again after it's made. */
export const shareLinkResponseSchema = z.object({
  id: z.uuid(),
  resourceType: z.enum(RESOURCE_KINDS),
  resourceId: z.uuid(),
  /** @deprecated Always `'comment'`; see `deprecatedRoleSchema`. */
  role: deprecatedRoleSchema,
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /** Not revoked and not expired. It also needs what it's for to be unlisted or public to work. */
  active: z.boolean(),
});
export type ShareLinkResponse = z.infer<typeof shareLinkResponseSchema>;

/** A new link and its token: the only time the token is returned. */
export const createShareLinkResponseSchema = z.object({
  link: shareLinkResponseSchema,
  token: shareTokenSchema,
});
export type CreateShareLinkResponse = z.infer<typeof createShareLinkResponseSchema>;

/** A track's or project's links, newest first, revoked and expired ones included. */
export const shareLinkListResponseSchema = z.object({ links: z.array(shareLinkResponseSchema) });
export type ShareLinkListResponse = z.infer<typeof shareLinkListResponseSchema>;

export const shareLinkParamsSchema = z.object({ linkId: z.uuid() });

/**
 * `GET /v1/share-links/current`: what the link presented in `x-share-token` opens, so a listen page
 * that only has the token knows what to load. A 404 unless the link works and what it's for can be
 * viewed with it.
 */
export const sharedResourceResponseSchema = z.object({
  resourceType: z.enum(RESOURCE_KINDS),
  resourceId: z.uuid(),
  /** @deprecated Always `'comment'`; see `deprecatedRoleSchema`. */
  role: deprecatedRoleSchema,
});
export type SharedResourceResponse = z.infer<typeof sharedResourceResponseSchema>;
