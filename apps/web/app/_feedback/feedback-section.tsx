'use client';

import type { ReactNode } from 'react';
import type { FeedbackThread } from '@feedback/shared';
import type { PlayerItem } from '../../lib/audio-store';
import { audioStore } from '../_player/store';
import { Composer } from './composer';
import { Thread } from './thread';

/**
 * The comments on the version in the player: how many are open, a box to write one (or, for
 * someone who can't comment, `signIn` in its place), and the threads in timeline order.
 */
export function FeedbackSection({
  item,
  threads,
  canComment,
  highlightId,
  signIn,
}: {
  item: PlayerItem;
  threads: readonly FeedbackThread[];
  canComment: boolean;
  /** A comment picked from the waveform, lit until another is picked. */
  highlightId: string | null;
  signIn?: ReactNode;
}) {
  const live = threads.filter((t) => !t.deleted);
  const open = live.filter((t) => t.status === 'open').length;
  const resolved = live.length - open;

  return (
    <section aria-labelledby="feedback-heading" className="mt-12">
      <h2 id="feedback-heading" className="text-lg font-semibold">
        Feedback
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        {live.length === 0
          ? `No comments on v${item.versionNumber} yet.`
          : `On v${item.versionNumber}: ${open} open${resolved ? `, ${resolved} resolved` : ''}.`}
      </p>

      {canComment ? <Composer key={item.versionId} item={item} /> : signIn}

      {threads.length > 0 && (
        <ul className="mt-6 border-t border-rule">
          {threads.map((thread) => (
            <Thread
              key={thread.id}
              thread={thread}
              highlighted={thread.id === highlightId}
              onPlayAt={(ms) => void audioStore.play(item, ms)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
