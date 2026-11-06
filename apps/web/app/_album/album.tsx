'use client';

import { useEffect, type ReactNode } from 'react';
import { queueIndex, type PlayerItem } from '../../lib/audio-store';
import { audioStore, useAudio } from '../_player/store';
import { PlayPauseIcon, TransportButton } from '../_player/transport-button';

// A project played like an album, through the mini-player. Used by its owner's page and by what
// listeners see of it, so both hear the same thing: every playable track, in running order.

/** Keeps the queue in the player up to date when the running order here changes. */
export function useAlbumQueue(projectId: string, items: readonly PlayerItem[]) {
  useEffect(() => audioStore.syncQueue(projectId, items), [projectId, items]);
}

/** The project's main action: plays it from the top, then pauses and resumes. */
export function PlayAlbumButton({
  projectId,
  title,
  items,
}: {
  projectId: string;
  title: string;
  items: readonly PlayerItem[];
}) {
  const loaded = useAudio((s) => s.queueId === projectId && queueIndex(s) >= 0);
  const status = useAudio((s) => (s.queueId === projectId ? s.status : 'idle'));
  // Played through to the end, which reads as stopped: pressing it starts the album over.
  const finished = useAudio(
    (s) =>
      s.queueId === projectId &&
      s.status === 'paused' &&
      queueIndex(s) === s.queue.length - 1 &&
      s.item !== null &&
      s.positionMs >= s.item.durationMs,
  );
  const active = status === 'playing' || status === 'loading';
  const resumable = loaded && !finished;
  const label = active ? 'Pause' : resumable ? 'Resume' : 'Play';

  function press() {
    if (active) audioStore.pause();
    else if (resumable) void audioStore.resume();
    else void audioStore.playQueue(projectId, items, 0);
  }

  return (
    <button
      type="button"
      // Wide enough for its longest word, so what's beside it stays put as it changes.
      className="btn btn-primary min-w-28"
      aria-label={`${label} ${title}`}
      aria-busy={status === 'loading'}
      onClick={press}
    >
      <PlayPauseIcon active={active} size={16} />
      {label}
    </button>
  );
}

/**
 * One track of a project in a list that plays in place: its transport button starts the project
 * from this track, or pauses and resumes it once it's in the player. The row is lit while the track
 * is in the player. A track with nothing ready has no button, and keeps its place in the columns.
 */
export function AlbumRow({
  projectId,
  trackId,
  title,
  number,
  items,
  children,
}: {
  projectId: string;
  trackId: string;
  title: string;
  number: number;
  items: readonly PlayerItem[];
  /** The title, its subtitle, and the length column. */
  children: ReactNode;
}) {
  const inPlayer = useAudio((s) => s.item?.trackId === trackId);
  const status = useAudio((s) => (s.item?.trackId === trackId ? s.status : 'idle'));
  const index = items.findIndex((item) => item.trackId === trackId);

  function press() {
    if (status === 'playing' || status === 'loading') audioStore.pause();
    else void audioStore.playQueue(projectId, items, index);
  }

  return (
    <li
      aria-current={inPlayer || undefined}
      data-playing={inPlayer || undefined}
      className="group relative isolate grid grid-cols-[2.75rem_1.75rem_minmax(0,1fr)] items-center gap-3 border-b border-rule py-2.5 data-playing:before:absolute data-playing:before:inset-y-0 data-playing:before:-inset-x-3 data-playing:before:-z-10 data-playing:before:bg-chrome-lo data-playing:before:shadow-[inset_2px_0_0_var(--color-accent)] sm:grid-cols-[2.75rem_2rem_minmax(0,1fr)_4rem]"
    >
      {index >= 0 ? (
        <TransportButton status={status} title={title} size="md" onClick={press} />
      ) : (
        <span />
      )}
      <span className="font-lcd text-base text-muted tabular-nums">
        {String(number).padStart(2, '0')}
      </span>
      {children}
    </li>
  );
}
