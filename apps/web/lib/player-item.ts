import type { TrackResponse, VersionResponse } from '@feedback/shared';
import type { PlayerItem } from './audio-store';

/** A ready version as the player plays it, through the share link if there is one. */
export function playerItem(
  track: TrackResponse,
  version: VersionResponse,
  token: string | null,
): PlayerItem {
  return {
    versionId: version.id,
    trackId: track.id,
    title: track.title,
    versionNumber: version.versionNumber,
    durationMs: version.durationMs ?? 0,
    peaks: version.waveformPeaks ?? [],
    ...(token && { shareToken: token }),
  };
}

/** What a list of tracks plays in order: each one's current version, skipping any without one. */
export function queueItems(tracks: readonly TrackResponse[], token: string | null): PlayerItem[] {
  return tracks.flatMap((track) => {
    const current = track.versions.find((v) => v.id === track.currentVersionId);
    return current ? [playerItem(track, current, token)] : [];
  });
}
