'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { CITY_LABELS, CITY_REGIONS, type ProfileResponse } from '@feedback/shared';
import { DownIcon } from '../../_shell/icons';
import { updateProfileAction } from './actions';
import { Avatar } from '../../_shell/avatar';

/**
 * Handle, name, bio and city, saved together. The handle previews as its page's address, and the
 * name as it will sign a comment.
 */
export function ProfileForm({ profile }: { profile: ProfileResponse }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);
  const [handle, setHandle] = useState(profile.handle ?? '');
  const [name, setName] = useState(profile.displayName ?? '');
  // "Saved." describes the last save, so it goes once the form changes again.
  const [edited, setEdited] = useState(false);
  const shownName = name.trim();
  const shownHandle = handle.trim().toLowerCase();

  return (
    <form
      action={action}
      onChange={() => setEdited(true)}
      onSubmit={() => setEdited(false)}
      className="max-w-xl space-y-4"
      aria-label="Your profile"
    >
      <div>
        <label htmlFor="handle" className="mb-1 block text-sm font-medium">
          Handle <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="handle"
          name="handle"
          maxLength={20}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          aria-describedby="handle-preview"
          className="field sm:max-w-xs"
        />
        <p id="handle-preview" className="mt-2 text-sm break-words text-muted">
          {!shownHandle ? (
            'Pick one for a public page showing only your public tracks and projects.'
          ) : shownHandle === profile.handle ? (
            <>
              Your public page:{' '}
              <Link href={`/@${profile.handle}`} className="link">
                /@{profile.handle}
              </Link>
            </>
          ) : (
            <>
              Your public page will be <span className="text-ink">/@{shownHandle}</span>. Letters,
              numbers, and underscores.
            </>
          )}
        </p>
      </div>

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
              On comments: <Avatar avatar={profile.avatar} size="inline" />{' '}
              <span className="font-medium break-words text-ink">{shownName}</span>
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
            {CITY_REGIONS.map((region) => (
              <optgroup key={region.label} label={region.label}>
                {region.cities.map((city) => (
                  <option key={city} value={city}>
                    {CITY_LABELS[city]}
                  </option>
                ))}
              </optgroup>
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
