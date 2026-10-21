'use client';

import { useActionState, useState } from 'react';
import { CITIES, CITY_LABELS, type ProfileResponse } from '@feedback/shared';
import { DownIcon } from '../../_shell/icons';
import { updateProfileAction } from './actions';

/** Name, bio and city, saved together. The name previews as it will sign a comment. */
export function ProfileForm({ profile }: { profile: ProfileResponse }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);
  const [name, setName] = useState(profile.displayName ?? '');
  // "Saved." describes the last save, so it goes once the form changes again.
  const [edited, setEdited] = useState(false);
  const shownName = name.trim();

  return (
    <form
      action={action}
      onChange={() => setEdited(true)}
      onSubmit={() => setEdited(false)}
      className="max-w-xl space-y-4"
      aria-label="Your profile"
    >
      <div>
        <label htmlFor="display-name" className="mb-1 block text-sm font-medium">
          Name
        </label>
        <input
          id="display-name"
          name="displayName"
          maxLength={50}
          autoComplete="nickname"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-describedby="display-name-preview"
          className="field"
        />
        <p id="display-name-preview" className="mt-2 text-sm text-muted">
          {shownName ? (
            <>
              On comments: <span className="font-medium break-words text-ink">{shownName}</span>
              {' · '}
              <span className="font-lcd text-ink tabular-nums">1:23</span>
            </>
          ) : (
            'Add a name so people know who left a comment.'
          )}
        </p>
      </div>

      <div>
        <label htmlFor="bio" className="mb-1 block text-sm font-medium">
          Bio <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          defaultValue={profile.bio ?? ''}
          className="field"
        />
      </div>

      <div className="sm:max-w-xs">
        <label htmlFor="city" className="mb-1 block text-sm font-medium">
          City <span className="font-normal text-muted">(optional)</span>
        </label>
        <div className="relative">
          <select
            id="city"
            name="city"
            defaultValue={profile.city ?? ''}
            className="field appearance-none pr-10"
          >
            <option value="">None</option>
            {CITIES.map((city) => (
              <option key={city} value={city}>
                {CITY_LABELS[city]}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
            <DownIcon />
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        {state && !edited && !pending && (
          <p
            role={state.ok ? 'status' : 'alert'}
            className={`text-sm ${state.ok ? 'text-muted' : 'text-danger'}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
