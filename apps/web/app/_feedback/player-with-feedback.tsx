'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { FeedbackThread } from '@feedback/shared';
import type { PlayerItem } from '../../../lib/audio-store';
import { FeedbackSection } from '../../_feedback/feedback-section';
import type { FeedbackMarker } from '../../_feedback/markers';
import { TrackPlayer } from '../../_player/track-player';

/**
 * The player and the comments on whichever version it shows (A or B), with a marker under the
 * waveform for each pinned comment. `status` (the newest upload's state) sits between them.
 */
export function TrackListening({
  current,
  older,
  feedback,
  status,
}: {
  current: PlayerItem;
  older: readonly PlayerItem[];
  /** Comments by version id, for every ready version. */
  feedback: Readonly<Record<string, readonly FeedbackThread[]>>;
  status: ReactNode;
}) {
  const [shownId, setShownId] = useState(current.versionId);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const shown = [current, ...older].find((v) => v.versionId === shownId) ?? current;

  const markers = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(feedback).map(([versionId, threads]) => [
          versionId,
          threads.flatMap((t): FeedbackMarker[] =>
            t.timestampMs === null || t.deleted
              ? []
              : [{ id: t.id, timestampMs: t.timestampMs, resolved: t.status === 'resolved' }],
          ),
        ]),
      ),
    [feedback],
  );

  function showComment(id: string) {
    setHighlightId(id);
    // No smooth scrolling: the page stays still (DESIGN.md).
    document.getElementById(`feedback-${id}`)?.scrollIntoView({ block: 'center' });
  }

  return (
    <>
      <div className="mt-8">
        <TrackPlayer
          current={current}
          older={older}
          markers={markers}
          onMarker={showComment}
          onShow={setShownId}
        />
      </div>
      {status}
      <FeedbackSection
        item={shown}
        threads={feedback[shown.versionId] ?? []}
        canComment
        highlightId={highlightId}
      />
    </>
  );
}
