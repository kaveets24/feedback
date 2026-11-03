'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { updateVersionRequestSchema, type VersionResponse } from '@feedback/shared';
import { toResult, type ActionResult } from '../../../lib/action-result';
import { serverApi } from '../../../lib/api';

/** A version's current state, for the track page to poll while it processes. */
export async function getVersionAction(versionId: unknown): Promise<ActionResult<VersionResponse>> {
  const parsed = z.uuid().safeParse(versionId);
  if (!parsed.success) return { ok: false, message: 'Unknown version.' };
  return toResult(() => serverApi().getVersion(parsed.data));
}

/** Saves a version's change notes; blank clears them. */
export async function updateVersionNotesAction(
  versionId: unknown,
  changeNotes: unknown,
): Promise<ActionResult<VersionResponse>> {
  const parsedId = z.uuid().safeParse(versionId);
  const parsed = updateVersionRequestSchema.safeParse({ changeNotes });
  if (!parsedId.success) return { ok: false, message: 'Unknown version.' };
  if (!parsed.success) return { ok: false, message: 'Notes can be up to 2000 characters.' };

  const result = await toResult(() => serverApi().updateVersion(parsedId.data, parsed.data));
  if (!result.ok) {
    return { ok: false, message: "Couldn't save the notes. Reload the page and try again." };
  }
  revalidatePath(`/tracks/${result.data.trackId}`);
  return result;
}

/** Deletes the track and goes back to your tracks. */
export async function deleteTrackAction(trackId: unknown): Promise<ActionResult<null>> {
  const parsed = z.uuid().safeParse(trackId);
  if (!parsed.success) return { ok: false, message: 'Unknown track.' };
  const result = await toResult(() => serverApi().deleteTrack(parsed.data));
  if (!result.ok) {
    return { ok: false, message: "Couldn't delete the track. Reload the page and try again." };
  }
  revalidatePath('/tracks');
  revalidatePath(`/tracks/${parsed.data}`);
  // It may have been in a project, whose page and list count it.
  revalidatePath('/projects', 'layout');
  redirect('/tracks');
}
