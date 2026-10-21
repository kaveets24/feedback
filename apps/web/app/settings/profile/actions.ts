'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  createAvatarRequestSchema,
  updateProfileRequestSchema,
  type AvatarResponse,
  type CreateAvatarResponse,
} from '@feedback/shared';
import { toResult, type ActionResult } from '../../../lib/action-result';
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

const avatarId = z.uuid();

/** Starts uploading a profile picture; the browser then PUTs the image to the returned URL. */
export async function startAvatarUploadAction(
  input: unknown,
): Promise<ActionResult<CreateAvatarResponse>> {
  const parsed = createAvatarRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Choose a JPEG, PNG, or WebP image up to 10 MB.' };
  }
  const result = await toResult(() => serverApi().startAvatarUpload(parsed.data));
  return result.ok ? result : { ok: false, message: "Couldn't start the upload. Try again." };
}

/** Hands an uploaded picture to the worker. Safe to repeat. */
export async function completeAvatarUploadAction(
  id: unknown,
): Promise<ActionResult<AvatarResponse>> {
  const parsed = avatarId.safeParse(id);
  if (!parsed.success) return { ok: false, message: 'Unknown picture.' };
  const result = await toResult(() => serverApi().completeAvatarUpload(parsed.data));
  if (result.ok) revalidatePath('/settings/profile');
  return result.ok
    ? result
    : { ok: false, message: "The image uploaded, but we couldn't start processing it. Try again." };
}

/** A picture upload's state, for the profile page to poll while it processes. */
export async function getAvatarAction(id: unknown): Promise<ActionResult<AvatarResponse>> {
  const parsed = avatarId.safeParse(id);
  if (!parsed.success) return { ok: false, message: 'Unknown picture.' };
  return toResult(() => serverApi().getAvatar(parsed.data));
}

/** Takes the profile picture off. */
export async function removeAvatarAction(): Promise<ActionResult<undefined>> {
  const result = await toResult(() => serverApi().removeAvatar());
  if (!result.ok) return { ok: false, message: "Couldn't remove your picture. Try again." };
  revalidatePath('/settings/profile');
  return result;
}
