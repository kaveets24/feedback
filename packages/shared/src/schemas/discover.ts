import { z } from 'zod';
import { feedbackAuthorSchema } from './feedback.ts';
import { followedArtistSchema } from './follows.ts';
import { genreSchema } from './genres.ts';

/**
 * What a search looks for: 2 to 100 characters, matched case-insensitively anywhere in a name. A
 * leading `@` is ignored, so `@sam` finds the handle `sam`.
 */
export const searchTermSchema = z.string().trim().min(2).max(100);

/** Whose tracks home lists: everyone's, or only the people the signed-in user follows. */
export const DISCOVER_VIEWS = ['everyone', 'following'] as const;
export const discoverViewSchema = z.enum(DISCOVER_VIEWS);
export type DiscoverView = z.infer<typeof discoverViewSchema>;

/** `GET /v1/discover`: a page of public tracks, optionally only one genre, or matching `q`. */
export const discoverQuerySchema = z.object({
  /** `following` needs a signed-in account (a 401 otherwise). */
  view: discoverViewSchema.default('everyone'),
  genre: genreSchema.optional(),
  /** Keeps tracks whose title, or artist's display name or handle, contains this. */
  q: searchTermSchema.optional(),
  /** `nextCursor` from the previous page; omit for the first. Treat it as opaque. */
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type DiscoverQuery = z.input<typeof discoverQuerySchema>;

/**
 * A public track as discovery lists it, with the version that plays. The artist shows like a
 * comment's author: their name and picture, and their handle if they have a public page.
 */
export const discoverItemSchema = z.object({
  track: z.object({ id: z.uuid(), title: z.string(), genre: genreSchema.nullable() }),
  version: z.object({
    id: z.uuid(),
    versionNumber: z.number().int().positive(),
    durationMs: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
  }),
  artist: feedbackAuthorSchema,
});
export type DiscoverItem = z.infer<typeof discoverItemSchema>;

/**
 * Public tracks, the most recently updated first: by when their current version was uploaded, so
 * a new version brings a track back to the top. Nothing is ranked by plays or popularity
 * (CLAUDE.md section 1). `nextCursor` is null on the last page.
 */
export const discoverResponseSchema = z.object({
  items: z.array(discoverItemSchema),
  nextCursor: z.uuid().nullable(),
});
export type DiscoverResponse = z.infer<typeof discoverResponseSchema>;

/** `GET /v1/profiles?q=`: people with a public page whose handle or display name contains `q`. */
export const profileSearchQuerySchema = z.object({ q: searchTermSchema });
export type ProfileSearchQuery = z.input<typeof profileSearchQuerySchema>;

/** The best matches: an exact handle first, then by handle. At most `PROFILE_SEARCH_LIMIT`. */
export const profileSearchResponseSchema = z.object({ artists: z.array(followedArtistSchema) });
export type ProfileSearchResponse = z.infer<typeof profileSearchResponseSchema>;

export const PROFILE_SEARCH_LIMIT = 10;
