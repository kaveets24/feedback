'use client';

import { createContext, use, type ReactNode } from 'react';
import type { PlayerItem } from '../../lib/audio-store';
import { useAlbumQueue } from '../_album/album';
import { TransportButton } from '../_player/transport-button';
import { audioStore, useAudio } from '../_player/store';

type Queue = { queueId: string; items: readonly PlayerItem[] };

const QueueContext = createContext<Queue | null>(null);

/**
 * A results list that plays in order: pressing a row queues every row here, so the mini-player
 * and lock screen get previous and next, and it moves on when a track ends. `queueId` names the
 * list (its filters and page), so the queue keeps up when the list changes and leaves it alone
 * once the listener is somewhere else.
 */
export function ResultQueue({
  queueId,
  items,
  children,
}: Queue & {
  /** The `ResultRow`s, in the same order as `items`. */
  children: ReactNode;
}) {
  useAlbumQueue(queueId, items);
  return <QueueContext value={{ queueId, items }}>{children}</QueueContext>;
}

/**
 * One track in a `ResultQueue`, playable in place: the transport button plays the list from this
 * row, or pauses and resumes it once it's there. The row is lit while its version is the one in
 * the player, like the version history's current row.
 */
export function ResultRow({
  index,
  children,
}: {
  /** Its place in the `ResultQueue`'s items. */
  index: number;
  /** The title, meta line, and columns, rendered on the server. */
  children: ReactNode;
}) {
  const queue = use(QueueContext);
  const item = queue?.items[index];
  const versionId = item?.versionId;
  const inPlayer = useAudio(
    (state) => versionId !== undefined && state.item?.versionId === versionId,
  );
  const status = useAudio((state) =>
    versionId !== undefined && state.item?.versionId === versionId ? state.status : 'idle',
  );
  if (!queue || !item) throw new Error('ResultRow needs a ResultQueue with an item at its index.');

  function press() {
    if (status === 'playing' || status === 'loading') audioStore.pause();
    else if (queue) void audioStore.playQueue(queue.queueId, queue.items, index);
  }

  return (
    <li
      aria-current={inPlayer || undefined}
      data-playing={inPlayer || undefined}
      className="group relative isolate grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 border-b border-rule py-2.5 data-playing:before:absolute data-playing:before:inset-y-0 data-playing:before:-inset-x-3 data-playing:before:-z-10 data-playing:before:bg-chrome-lo data-playing:before:shadow-[inset_2px_0_0_var(--color-accent)] sm:grid-cols-[2.75rem_minmax(0,1fr)_4rem_4.5rem]"
    >
      <TransportButton status={status} title={item.title} size="md" onClick={press} />
      {children}
    </li>
  );
}
