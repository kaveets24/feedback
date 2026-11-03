'use client';

import { useState, useTransition } from 'react';
import { deleteTrackAction } from './actions';

/** Deleting the track, behind a confirm step. Plain words: it can't be undone. */
export function DeleteTrack({ trackId, title }: { trackId: string; title: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    setError(null);
    startTransition(async () => {
      // On success the action redirects to your tracks.
      const result = await deleteTrackAction(trackId);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <section aria-labelledby="delete-track-heading" className="mt-12 border-t border-rule pt-5">
      <h2 id="delete-track-heading" className="text-base font-semibold">
        Delete track
      </h2>
      {confirming ? (
        <div className="mt-2 space-y-3">
          <p className="max-w-[65ch]">
            Delete “{title}”? Every version and every comment on it goes with it, and its share
            links stop working. You can’t undo this.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn btn-danger"
              onClick={onDelete}
              disabled={pending}
              autoFocus
            >
              {pending ? 'Deleting…' : 'Delete track'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Keep track
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 max-w-[65ch] text-sm text-muted">
            Removes the track, its versions, and its comments for everyone.
          </p>
          <button type="button" className="btn btn-danger mt-3" onClick={() => setConfirming(true)}>
            Delete track…
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
