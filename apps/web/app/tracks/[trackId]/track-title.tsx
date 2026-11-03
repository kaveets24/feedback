'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { audioStore } from '../../_player/store';
import { renameTrackAction } from './actions';

/**
 * The track's name as the page heading, with a Rename button that swaps it for a field with Save
 * and Cancel, like `GenreSelect`. Escape cancels (unless a save is under way), and focus goes back
 * to Rename.
 */
export function TrackTitle({ trackId, title }: { trackId: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const renameRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      renameRef.current?.focus();
    }
  }, [editing]);

  function close() {
    returnFocus.current = true;
    setError(null);
    setEditing(false);
  }

  function save(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await renameTrackAction(trackId, form.get('title'));
      if (result.ok) {
        audioStore.retitle(trackId, result.data.title);
        close();
      } else {
        setError(result.message);
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        {/* The margin centres the first line on the button, which stays beside a long title. */}
        <h1 className="mt-0.5 min-w-0 text-3xl font-semibold break-words text-balance">{title}</h1>
        <button
          ref={renameRef}
          type="button"
          className="btn btn-ghost shrink-0"
          aria-label="Rename track"
          onClick={() => setEditing(true)}
        >
          Rename
        </button>
      </div>
    );
  }

  return (
    <>
      {/* The page keeps its heading for screen readers while the visible one is being edited. */}
      <h1 className="sr-only">{title}</h1>
      <form
        action={save}
        className="max-w-xl"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !pending) close();
        }}
      >
        <label htmlFor="track-title" className="mb-1 block text-sm font-medium">
          Title
        </label>
        <div className="flex gap-2">
          <input
            id="track-title"
            type="text"
            name="title"
            required
            maxLength={200}
            defaultValue={title}
            autoFocus
            className="field min-w-0 flex-1"
          />
          <button type="submit" className="btn" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn" onClick={close} disabled={pending}>
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </>
  );
}
