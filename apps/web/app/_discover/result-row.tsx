'use client';

import { useState, type ReactNode } from 'react';
import { TransportButton } from '../_player/transport-button';
import { audioStore, useAudio } from '../_player/store';
import { getPlayableVersionAction } from './actions';

/**
 * One track in a results list, playable in place: the transport button loads its version into the
 * mini-player, or pauses and resumes it once it's there. The row is lit while its version is the
 * one in the player, like the version history's current row.
 */
export function ResultRow({
  versionId,
  trackId,
  title,
  versionNumber,
  children,
}: {
  versionId: string;
  trackId: string;
  title: string;
  versionNumber: number;
  /** The title, meta line, and columns, rendered on the server. */
  children: ReactNode;
}) {
  const inPlayer = useAudio((state) => state.item?.versionId === versionId);
  const status = useAudio((state) => (state.item?.versionId === versionId ? state.status : 'idle'));
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function press() {
    if (inPlayer) return audioStore.toggle();
    setError(null);
    setFetching(true);
    // The player draws the version's waveform, so it needs the peaks the list leaves out.
    const result = await getPlayableVersionAction(versionId).catch(() => null);
    setFetching(false);
    if (!result?.ok || !result.data.waveformPeaks || result.data.durationMs === null) {
      setError(`Couldn’t play v${versionNumber}. Try again.`);
      return;
    }
    await audioStore.play({
      versionId,
      trackId,
      title,
      versionNumber,
      durationMs: result.data.durationMs,
      peaks: result.data.waveformPeaks,
    });
  }

  return (
    <li
      aria-current={inPlayer || undefined}
      data-playing={inPlayer || undefined}
      className="group relative isolate grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 border-b border-rule py-2.5 data-playing:before:absolute data-playing:before:inset-y-0 data-playing:before:-inset-x-3 data-playing:before:-z-10 data-playing:before:bg-chrome-lo data-playing:before:shadow-[inset_2px_0_0_var(--color-accent)] sm:grid-cols-[2.75rem_minmax(0,1fr)_4rem_4.5rem]"
    >
      <TransportButton
        status={fetching ? 'loading' : status}
        title={title}
        size="md"
        onClick={() => void press()}
      />
      {children}
      {error && (
        <p role="alert" className="col-start-2 text-sm text-danger sm:col-span-3">
          {error}
        </p>
      )}
    </li>
  );
}
