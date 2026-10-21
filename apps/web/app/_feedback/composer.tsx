'use client';

import { useId, useState, useTransition } from 'react';
import { MAX_FEEDBACK_LENGTH } from '@feedback/shared';
import type { PlayerItem } from '../../lib/audio-store';
import { formatDuration } from '../../lib/format';
import { useAudio } from '../_player/store';
import { createFeedbackAction } from './actions';
import { useFeedbackPlace } from './context';

/**
 * Writes a new comment on the version in the player. While the box is empty, the moment follows
 * the playhead; it holds still once you start typing, so the comment lands where you were
 * listening. Untick it for a general comment. With the version not in the player there's no
 * moment to pin to, so the comment is general.
 */
export function Composer({ item }: { item: PlayerItem }) {
  const place = useFeedbackPlace();
  const id = useId();
  const [body, setBody] = useState('');
  const [heldMs, setHeldMs] = useState<number | null>(null);
  const [pinned, setPinned] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const liveMs = useAudio((s) =>
    s.item?.versionId === item.versionId && s.status !== 'idle' ? s.positionMs : null,
  );
  const atMs = body ? heldMs : liveMs;

  function submit() {
    if (!body.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createFeedbackAction(
        item.versionId,
        { body, timestampMs: pinned ? atMs : null },
        place.shareToken,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBody('');
      setHeldMs(null);
      setPinned(true);
      place.onChanged();
    });
  }

  return (
    <form
      className="max-w-xl space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={`${id}-body`} className="block text-sm font-medium">
        Comment on v{item.versionNumber}
      </label>
      <textarea
        id={`${id}-body`}
        rows={3}
        maxLength={MAX_FEEDBACK_LENGTH}
        value={body}
        disabled={pending}
        placeholder="What do you hear?"
        onChange={(event) => {
          const next = event.target.value;
          if (!body && next) setHeldMs(liveMs);
          setBody(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
        }}
        className="field"
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" className="btn btn-primary" disabled={pending || !body.trim()}>
          {pending ? 'Posting…' : 'Comment'}
        </button>
        {atMs !== null ? (
          <label className="inline-flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pinned}
              disabled={pending}
              onChange={(event) => setPinned(event.target.checked)}
              className="size-4 accent-accent"
            />
            <span>
              At <span className="font-lcd tabular-nums">{formatDuration(atMs)}</span>
            </span>
          </label>
        ) : (
          <p className="text-sm text-muted">Play it to pin your comment to a moment.</p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
