'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FeedbackThread } from '@feedback/shared';
import type { PlayerItem } from '../../lib/audio-store';
import { TrackPlayer } from '../_player/track-player';
import { FeedbackSection, type Threads } from './feedback-section';
import type { FeedbackMarker } from './markers';

/**
 * The player and the comments on whichever version it shows (A or B), with a marker under the
 * waveform for each pinned comment. Used by the track page and the listen page. `status` (the
 * newest upload's state, on the track page) sits between them.
 */
export function PlayerWithFeedback({
  current,
  older,
  feedback,
  prompts,
  canComment,
  canEditPrompt,
  signIn,
  status,
  onShow,
  initialVersionId,
  initialHighlightId,
}: {
  current: PlayerItem;
  older: readonly PlayerItem[];
  /** Comments by version id: loaded, still loading (absent), or failed to load (null). */
  feedback: Readonly<Record<string, Threads>>;
  /** What the artist wants feedback on, by version id. */
  prompts: Readonly<Record<string, string | null>>;
  canComment: boolean;
  canEditPrompt: boolean;
  /** In the comment box's place for someone who can't comment. */
  signIn?: ReactNode;
  status?: ReactNode;
  /** Told which version is shown, so a page can load its comments. */
  onShow?: (versionId: string) => void;
  /** Opens at a comment (from a notification): its version shown, its thread lit and in view. */
  initialVersionId?: string;
  initialHighlightId?: string;
}) {
  const [shownId, setShownId] = useState(initialVersionId ?? current.versionId);
  const [highlightId, setHighlightId] = useState<string | null>(initialHighlightId ?? null);

  useEffect(() => {
    if (initialHighlightId) {
      document
        .getElementById(`feedback-${initialHighlightId}`)
        ?.scrollIntoView({ block: 'center' });
    }
  }, [initialHighlightId]);
  const shown = [current, ...older].find((v) => v.versionId === shownId) ?? current;

  const markers = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(feedback).map(([versionId, threads]) => [
          versionId,
          (threads ?? []).flatMap((t: FeedbackThread): FeedbackMarker[] =>
            t.timestampMs === null || t.deleted
              ? []
              : [{ id: t.id, timestampMs: t.timestampMs, resolved: t.status === 'resolved' }],
          ),
        ]),
      ),
    [feedback],
  );

  const show = useCallback(
    (versionId: string) => {
      setShownId(versionId);
      onShow?.(versionId);
    },
    [onShow],
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
          onShow={show}
          initialVersionId={initialVersionId}
        />
      </div>
      {status}
      <FeedbackSection
        item={shown}
        threads={feedback[shown.versionId]}
        prompt={prompts[shown.versionId] ?? null}
        canComment={canComment}
        canEditPrompt={canEditPrompt}
        highlightId={highlightId}
        signIn={signIn}
      />
    </>
  );
}
