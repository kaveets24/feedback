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
export type Visibility = z.infer<typeof visibilitySchema>;

/** A version's state, for the artist to watch while it processes and for the player once ready. */
export const versionResponseSchema = z.object({
  id: z.uuid(),
  trackId: z.uuid(),
  versionNumber: z.number().int().positive(),
  /** What changed in this version, in the artist's words. */
  changeNotes: z.string().nullable(),
  /**
   * What the artist wants feedback on in this version, shown above its comments. Defaults to null
   * so a web build ahead of the API (a preview deploy) still reads older responses.
   */
  feedbackPrompt: z.string().nullable().default(null),
  /**
   * The name of the file the artist uploaded. Null for anyone but the owner: file names can say
   * more than the artist means to share.
   */
  originalFilename: z.string().nullable(),
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

/** Change notes: up to 2000 characters. Blank (after trimming) is saved as none. */
export const changeNotesSchema = z.string().trim().max(2000).nullable();

/**
 * `PATCH /v1/versions/:versionId`: the owner fixes a version's notes or what they want feedback
 * on; null or blank clears one, and a field left out stays as it is.
 */
export const updateVersionRequestSchema = z
  .object({
    changeNotes: changeNotesSchema.optional(),
    /** Same limits as notes: up to 2000 characters. */
    feedbackPrompt: changeNotesSchema.optional(),
  })
  .refine((input) => input.changeNotes !== undefined || input.feedbackPrompt !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateVersionRequest = z.infer<typeof updateVersionRequestSchema>;

/** `GET /v1/versions/:versionId/stream`: where the player loads a ready version's audio. */
export const streamResponseSchema = z.object({
  /** Presigned GET for the stream file: a bearer credential, so never log it. */
  url: z.url(),
  /** Fetch a new one before this (or when playback fails after it) to keep playing. */
  expiresAt: z.iso.datetime(),
});
export type StreamResponse = z.infer<typeof streamResponseSchema>;

/**
 * Who can hear a track (CLAUDE.md section 6, rule 7): `visibility` is the effective one, and
 * `inheritsVisibility` says it comes from the track's project rather than the track itself.
 */
const trackVisibilityFields = {
  visibility: visibilitySchema,
  inheritsVisibility: z.boolean(),
};

/** A track in a list: enough to show it and its newest version's state. */
export const trackSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  /** The project it's in, or null for a loose track (or one in a project you can't see). */
  projectId: z.uuid().nullable(),
  ...trackVisibilityFields,
  createdAt: z.iso.datetime(),
  /** The newest `ready` version, the one that plays. Null until one is ready. */
  currentVersionId: z.uuid().nullable(),
  /**
   * For the owner, the newest version in any status, so a list can show one still processing or
   * failed. For anyone else, the current version: listeners only ever see ready versions.
   */
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

/**
 * A track with its versions, newest first. The owner gets every version; anyone else only the
 * ready ones, with no notes and no file names.
 */
export const trackResponseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  /** Null for a loose track, or for anyone who can't see the project it's in. */
  projectId: z.uuid().nullable(),
  /** The artist's own notes on the track. Null for anyone but the owner. */
  notes: z.string().nullable(),
  ...trackVisibilityFields,
  createdAt: z.iso.datetime(),
  currentVersionId: z.uuid().nullable(),
  versions: z.array(versionResponseSchema),
  /**
   * Whether the asker owns the track, so a page shows the owner's controls rather than a
   * listener's view. Defaults to false so a web build ahead of the API still reads older responses.
   */
  canManage: z.boolean().default(false),
});
export type TrackResponse = z.infer<typeof trackResponseSchema>;

/**
 * `PATCH /v1/tracks/:trackId`: who can hear the track (owner only). For a loose track, its own
 * visibility. For a track in a project, an override of the project's, which may be wider (the
 * owner's explicit choice, rule 7); null goes back to following the project, and is a 409 for a
 * loose track.
 */
export const updateTrackRequestSchema = z.object({ visibility: visibilitySchema.nullable() });
export type UpdateTrackRequest = z.infer<typeof updateTrackRequestSchema>;
