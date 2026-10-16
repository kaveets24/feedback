import { z } from 'zod';
import { VISIBILITIES } from '@feedback/authz';

/**
 * Lifecycle of a track version (CLAUDE.md section 7). A version is created `uploading` when the
 * API hands out the presigned upload URL, moves to `processing` once the upload is confirmed, and
 * ends `ready` (immutable from then on) or `failed` (with a reason). A failed version is never
 * retried: the artist uploads again, which makes a new version.
 */
export const VERSION_STATUSES = ['uploading', 'processing', 'ready', 'failed'] as const;
export const versionStatusSchema = z.enum(VERSION_STATUSES);
export type VersionStatus = z.infer<typeof versionStatusSchema>;

const NEXT_STATUSES: Record<VersionStatus, readonly VersionStatus[]> = {
  uploading: ['processing', 'failed'],
  processing: ['ready', 'failed'],
  ready: [],
  failed: [],
};

/** Whether a version may move from one status to another. */
export function canTransition(from: VersionStatus, to: VersionStatus): boolean {
  return NEXT_STATUSES[from].includes(to);
}

/** The statuses a version can move to `to` from. */
export function statusesBefore(to: VersionStatus): VersionStatus[] {
  return VERSION_STATUSES.filter((from) => canTransition(from, to));
}

/**
 * Points in a ready version's `waveformPeaks`. Each is the loudest sample in its slice of the
 * track, as a fraction of full scale (0 to 1), so a quiet recording draws as quiet.
 */
export const WAVEFORM_PEAK_COUNT = 1000;

export const visibilitySchema = z.enum(VISIBILITIES);

/** A version's state, for the artist to watch while it processes and for the player once ready. */
export const versionResponseSchema = z.object({
  id: z.uuid(),
  trackId: z.uuid(),
  versionNumber: z.number().int().positive(),
  status: versionStatusSchema,
  /** Why the version failed, in words for the artist. Null unless `failed`. */
  failureReason: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  /** `WAVEFORM_PEAK_COUNT` points, each 0 to 1 of full scale. Null until `ready`. */
  waveformPeaks: z.array(z.number().min(0).max(1)).nullable(),
  createdAt: z.iso.datetime(),
});
export type VersionResponse = z.infer<typeof versionResponseSchema>;

export const versionParamsSchema = z.object({ versionId: z.uuid() });

/** `GET /v1/versions/:versionId/stream`: where the player loads a ready version's audio. */
export const streamResponseSchema = z.object({
  /** Presigned GET for the stream file: a bearer credential, so never log it. */
  url: z.url(),
  /** Fetch a new one before this (or when playback fails after it) to keep playing. */
  expiresAt: z.iso.datetime(),
});
export type StreamResponse = z.infer<typeof streamResponseSchema>;

/** A track in a list: enough to show it and its newest version's state. */
export const trackSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  visibility: visibilitySchema,
  createdAt: z.iso.datetime(),
  /** The newest `ready` version, the one that plays. Null until one is ready. */
  currentVersionId: z.uuid().nullable(),
  /** The newest version in any status, so a list can show one still processing or failed. */
  latestVersion: versionResponseSchema.pick({
    id: true,
    versionNumber: true,
    status: true,
    durationMs: true,
  }),
});
export type TrackSummary = z.infer<typeof trackSummarySchema>;

export const TRACK_LIST_DEFAULT_LIMIT = 50;
export const TRACK_LIST_MAX_LIMIT = 100;

export const trackListQuerySchema = z.object({
  /** `nextCursor` from the previous page; omit for the first. Treat it as opaque. */
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(TRACK_LIST_MAX_LIMIT).default(TRACK_LIST_DEFAULT_LIMIT),
});
export type TrackListQuery = z.input<typeof trackListQuerySchema>;

/** Newest first. `nextCursor` is null on the last page. */
export const trackListResponseSchema = z.object({
  tracks: z.array(trackSummarySchema),
  nextCursor: z.string().nullable(),
});
export type TrackListResponse = z.infer<typeof trackListResponseSchema>;

export const trackParamsSchema = z.object({ trackId: z.uuid() });

/** A track with all its versions, newest first. */
export const trackResponseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  visibility: visibilitySchema,
  createdAt: z.iso.datetime(),
  currentVersionId: z.uuid().nullable(),
  versions: z.array(versionResponseSchema),
});
export type TrackResponse = z.infer<typeof trackResponseSchema>;
