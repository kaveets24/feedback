'use client';

import type { ReactNode } from 'react';
import { useAudio } from '../../_player/store';

/**
 * One item of the version history, lit while its version is the one in the player (playing or
 * paused), so A/B switching shows which version you're hearing.
 */
export function VersionItem({ versionId, children }: { versionId: string; children: ReactNode }) {
  const status = useAudio((s) => (s.item?.versionId === versionId ? s.status : 'idle'));
  const inPlayer = status !== 'idle';
  const playing = status === 'playing' || status === 'loading';

  return (
    <li
      data-playing={inPlayer || undefined}
      aria-current={inPlayer || undefined}
      // The fill bleeds 12px into the gutter so the content has room, without moving the content
      // or the rules.
      className="group relative isolate border-b border-rule py-3 data-playing:before:absolute data-playing:before:inset-y-0 data-playing:before:-inset-x-3 data-playing:before:-z-10 data-playing:before:bg-chrome-lo data-playing:before:shadow-[inset_2px_0_0_var(--color-accent)]"
    >
      {inPlayer && <span className="sr-only">{playing ? 'Now playing: ' : 'In the player: '}</span>}
      {children}
    </li>
  );
}
