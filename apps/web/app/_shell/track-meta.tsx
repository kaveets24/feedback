import type { TrackSummary } from '@feedback/shared';
import { formatDuration, STATUS_LABELS } from '../../lib/format';

/** A track's length as m:ss, once its newest version is ready. */
export function trackLength({ latestVersion: v }: TrackSummary): string | null {
  return v.status === 'ready' && v.durationMs !== null ? formatDuration(v.durationMs) : null;
}

/**
 * The line under a track's title: its newest version and any state that isn't "ready" (in the
 * danger color when it failed). On phones it also carries the length, since the length column is
 * hidden there.
 */
export function TrackSubtitle({ track }: { track: TrackSummary }) {
  const { versionNumber, status } = track.latestVersion;
  const length = trackLength(track);
  return (
    <p className={`text-sm ${status === 'failed' ? 'text-danger' : 'text-muted'}`}>
      v{versionNumber}
      {status !== 'ready' && ` · ${STATUS_LABELS[status]}`}
      {length && (
        <span className="sm:hidden">
          {' · '}
          <span className="font-lcd text-base text-ink tabular-nums">{length}</span>
        </span>
      )}
    </p>
  );
}

/** The length column (from `sm`): an LCD figure, or a muted dash until there's one. */
export function TrackLength({ track }: { track: TrackSummary }) {
  return (
    <span className="hidden text-right font-lcd text-base tabular-nums sm:block">
      {trackLength(track) ?? <span className="text-muted">—</span>}
    </span>
  );
}
