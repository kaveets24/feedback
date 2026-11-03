import { z } from 'zod';
import { feedbackAuthorSchema } from './feedback.ts';
import { genreSchema } from './genres.ts';

/** `GET /v1/discover`: a page of public tracks, optionally only one genre. */
export const discoverQuerySchema = z.object({
  genre: genreSchema.optional(),
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
