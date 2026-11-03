'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { GENRE_LABELS, GENRE_OPTIONS, type Genre } from '@feedback/shared';
import { DownIcon } from '../../_shell/icons';
import { setTrackGenreAction } from './actions';

/**
 * The track's genre, with a Change button that opens a select with Save and Cancel, like
 * `ProjectSelect`. Escape cancels (unless a save is under way), and focus goes back to Change.
 */
export function GenreSelect({ trackId, genre }: { trackId: string; genre: Genre | null }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      changeRef.current?.focus();
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
      const result = await setTrackGenreAction(trackId, form.get('genre'));
      if (result.ok) close();
      else setError(result.message);
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="text-muted">Genre</span>
        <span>{genre ? GENRE_LABELS[genre] : 'None'}</span>
        <button
          ref={changeRef}
          type="button"
          className="btn btn-ghost"
          aria-label="Change genre"
          onClick={() => setEditing(true)}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <form
      action={save}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !pending) close();
      }}
    >
      <label htmlFor="track-genre" className="mb-1 block text-sm font-medium">
        Genre
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <select
            id="track-genre"
            name="genre"
            defaultValue={genre ?? ''}
            autoFocus
            className="field appearance-none pr-10"
          >
            <option value="">None</option>
            {GENRE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {GENRE_LABELS[option]}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
            <DownIcon />
          </span>
        </div>
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
  );
}
