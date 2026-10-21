import { z } from 'zod';
import { coverImageSchema } from './covers.ts';

/** Someone you follow: always someone with a public page, so there's always a handle. */
export const followedArtistSchema = z.object({
  handle: z.string(),
  displayName: z.string().nullable(),
  /** A short-lived signed URL; never log it. */
  avatar: coverImageSchema.nullable(),
});
export type FollowedArtist = z.infer<typeof followedArtistSchema>;

/** A page of a feed-like list: `GET /v1/me/following` and `GET /v1/feed`. */
export const followListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type FollowListQuery = z.input<typeof followListQuerySchema>;

/** `GET /v1/me/following`: who you follow, the most recently followed first. */
export const followingResponseSchema = z.object({
  artists: z.array(followedArtistSchema),
  nextCursor: z.uuid().nullable(),
});
export type FollowingResponse = z.infer<typeof followingResponseSchema>;

/**
 * One thing in the feed: a ready version of a public track by someone you follow. Version 1 is a
 * new track; anything after, a new version of one.
 */
export const feedItemSchema = z.object({
  versionId: z.uuid(),
  versionNumber: z.number().int().positive(),
  durationMs: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  track: z.object({ id: z.uuid(), title: z.string() }),
  artist: followedArtistSchema,
});
export type FeedItem = z.infer<typeof feedItemSchema>;

/** `GET /v1/feed`: new public work by the people you follow, newest first. */
export const feedResponseSchema = z.object({
  items: z.array(feedItemSchema),
  nextCursor: z.uuid().nullable(),
});
export type FeedResponse = z.infer<typeof feedResponseSchema>;
