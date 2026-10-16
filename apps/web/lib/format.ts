import type { VersionStatus } from '@feedback/shared';

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

/** The calendar date of an ISO timestamp, in UTC so server and browser agree, e.g. "2026-10-16". */
export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
