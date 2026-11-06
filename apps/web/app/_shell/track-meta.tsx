import type { TrackSummary } from '@feedback/shared';
import type { PlayerItem } from '../../lib/audio-store';
import { formatDuration, STATUS_LABELS } from '../../lib/format';

/** A track's length as m:ss, once its newest version is ready. */
export function trackLength({ latestVersion: v }: TrackSummary): string | null {
  return v.status === 'ready' && v.durationMs !== null ? formatDuration(v.durationMs) : null;
}

/**
 * The line under a track's title: its newest version and any state that isn't "ready" (in the
 * danger color when it failed). On phones it also carries the length, since the length column is
 * hidden there. With `played`, the version that plays leads, and a newer upload still on its way
 * (or failed) follows it: "v2 · 3:11 · v3 Processing".
 */
export function TrackSubtitle({ track, played }: { track: TrackSummary; played?: PlayerItem }) {
  const { versionNumber, status } = track.latestVersion;
  const length = played ? formatDuration(played.durationMs) : trackLength(track);
  const newer = played && played.versionNumber !== versionNumber;
  const failed = status === 'failed';
  return (
    <p className={`text-sm ${failed && !newer ? 'text-danger' : 'text-muted'}`}>
      v{played?.versionNumber ?? versionNumber}
      {length && (
        <span className="sm:hidden">
          {' · '}
          <span className="font-lcd text-base text-ink tabular-nums">{length}</span>
        </span>
      )}
      {status !== 'ready' && (
        <>
          {' · '}
          <span className={failed ? 'text-danger' : undefined}>
            {newer && `v${versionNumber} `}
            {STATUS_LABELS[status]}
          </span>
        </>
      )}
    </p>
  );
}

/** The length column (from `sm`): an LCD figure, or a muted dash until there's one. */
export function TrackLength({ track, played }: { track: TrackSummary; played?: PlayerItem }) {
  return (
    <span className="hidden text-right font-lcd text-base tabular-nums sm:block">
      {(played ? formatDuration(played.durationMs) : trackLength(track)) ?? (
        <span className="text-muted">—</span>
      )}
    </span>
  );
}
