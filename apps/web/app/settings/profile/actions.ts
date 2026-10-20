'use server';

import { revalidatePath } from 'next/cache';
import { updateProfileRequestSchema } from '@feedback/shared';
import { toResult } from '../../../lib/action-result';
import { serverApi } from '../../../lib/api';

/** What the form shows after a save: a confirmation or what went wrong. */
export type ProfileFormState = { ok: boolean; message: string } | null;

/** Saves the whole form. Blank fields clear what was there; "None" clears the city. */
export async function updateProfileAction(
  _state: ProfileFormState,
  form: FormData,
): Promise<ProfileFormState> {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' && value.trim() ? value : null;
  };
  // Server actions are public endpoints, so input is checked here as well as by the API.
  const parsed = updateProfileRequestSchema.safeParse({
    displayName: text('displayName'),
    bio: text('bio'),
    city: text('city'),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Check the form: names are up to 50 characters and bios up to 500.',
    };
  }

  const result = await toResult(() => serverApi().updateProfile(parsed.data));
  if (!result.ok) return { ok: false, message: "Couldn't save your profile. Try again." };
  revalidatePath('/settings/profile');
  return { ok: true, message: 'Saved.' };
}
