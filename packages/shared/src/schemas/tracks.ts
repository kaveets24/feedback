import { z } from 'zod';

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
