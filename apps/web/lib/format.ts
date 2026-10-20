import type { ReleaseType, TrackSummary, VersionStatus } from '@feedback/shared';

/** A duration as m:ss (or h:mm:ss), e.g. 210000 → "3:30". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** A version's status in words for the artist. */
export const STATUS_LABELS: Record<VersionStatus, string> = {
  uploading: 'Upload not finished',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * The calendar date of an ISO timestamp, in UTC so server and browser agree, e.g.
 * "October 16, 2026".
 */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** A project's release type in words. */
export const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
  compilation: 'Compilation',
};

/** The combined length of the tracks whose newest version is ready (others have no length yet). */
export function totalDurationMs(tracks: readonly TrackSummary[]): number {
  return tracks.reduce(
    (sum, { latestVersion: v }) => sum + (v.status === 'ready' ? (v.durationMs ?? 0) : 0),
    0,
  );
}
