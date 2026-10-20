'use client';

import { useActionState } from 'react';
import { CITIES, CITY_LABELS, type ProfileResponse } from '@feedback/shared';
import { updateProfileAction } from './actions';

/** Plain HTML until this page is styled (CLAUDE.md section 9). */
export function ProfileForm({ profile }: { profile: ProfileResponse }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);

  return (
    <form action={action}>
      <p>
        <label htmlFor="display-name">Name</label>
        <br />
        <input
          id="display-name"
          name="displayName"
          maxLength={50}
          defaultValue={profile.displayName ?? ''}
          aria-describedby="display-name-hint"
        />
        <br />
        <small id="display-name-hint">Shown with your comments.</small>
      </p>
      <p>
        <label htmlFor="bio">Bio</label>
        <br />
        <textarea id="bio" name="bio" maxLength={500} rows={4} defaultValue={profile.bio ?? ''} />
      </p>
      <p>
        <label htmlFor="city">City (optional)</label>
        <br />
        <select id="city" name="city" defaultValue={profile.city ?? ''}>
          <option value="">None</option>
          {CITIES.map((city) => (
            <option key={city} value={city}>
              {CITY_LABELS[city]}
            </option>
          ))}
        </select>
      </p>
      <p>
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </p>
      {state && <p role={state.ok ? 'status' : 'alert'}>{state.message}</p>}
    </form>
  );
}
