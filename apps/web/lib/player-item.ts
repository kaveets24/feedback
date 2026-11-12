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

/**
 * A row of a list (home, a public profile) as the player queues it. Lists leave out the peaks,
 * so the player fetches them once the row plays (`fetchWaveform` in the audio store).
 */
export function listItem(
  track: { id: string; title: string },
  version: { id: string; versionNumber: number; durationMs: number | null },
): PlayerItem {
  return {
    versionId: version.id,
    trackId: track.id,
    title: track.title,
    versionNumber: version.versionNumber,
    durationMs: version.durationMs ?? 0,
    peaks: [],
  };
}
