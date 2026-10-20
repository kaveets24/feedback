'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { DownIcon } from '../../_shell/icons';
import { addProjectTrackAction } from '../actions';

export interface TrackOption {
  id: string;
  title: string;
}

/**
 * Adds one of the artist's tracks to the end of this project. Tracks in another project are
 * listed separately, since adding one moves it out of the project it's in.
 */
export function AddTrackForm({
  projectId,
  loose,
  elsewhere,
  hasTracks,
}: {
  projectId: string;
  loose: TrackOption[];
  elsewhere: (TrackOption & { projectTitle: string })[];
  hasTracks: boolean;
}) {
  const [state, action, pending] = useActionState(addProjectTrackAction, null);

  if (loose.length === 0 && elsewhere.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted">
        {hasTracks ? (
          'Every one of your tracks is in this project.'
        ) : (
          <>
            You don’t have any tracks yet.{' '}
            <Link href="/" className="link">
              Upload one
            </Link>{' '}
            to add it here.
          </>
        )}
      </p>
    );
  }

  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor="add-track" className="mb-1 block text-sm font-medium">
        Add a track
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <select
            id="add-track"
            name="trackId"
            required
            defaultValue=""
            className="field appearance-none pr-10"
          >
            <option value="" disabled>
              Choose a track…
            </option>
            {loose.length > 0 && (
              <optgroup label="Not in a project">
                {loose.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.title}
                  </option>
                ))}
              </optgroup>
            )}
            {elsewhere.length > 0 && (
              <optgroup label="In another project (moves it here)">
                {elsewhere.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.title} ({track.projectTitle})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
            <DownIcon />
          </span>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {state && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
