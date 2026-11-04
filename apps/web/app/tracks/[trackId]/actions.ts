'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  genreSchema,
  trackTitleSchema,
  updateVersionRequestSchema,
  type TrackResponse,
  type VersionResponse,
} from '@feedback/shared';
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

const trackDetailsSchema = z.object({
  title: trackTitleSchema.optional(),
  genre: genreSchema.nullable().optional(),
});

/** Saves the track's title and genre, the ones given; a null genre clears it. */
export async function updateTrackDetailsAction(
  trackId: unknown,
  changes: unknown,
): Promise<ActionResult<TrackResponse>> {
  const parsedId = z.uuid().safeParse(trackId);
  const parsed = trackDetailsSchema.safeParse(changes);
  if (!parsedId.success) return { ok: false, message: 'Unknown track.' };
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.path[0] === 'genre'
        ? 'Pick a genre from the list.'
        : 'Give the track a title, up to 200 characters.';
    return { ok: false, message };
  }

  const result = await toResult(() => serverApi().updateTrack(parsedId.data, parsed.data));
  if (!result.ok) {
    return { ok: false, message: "Couldn't save your changes. Reload the page and try again." };
  }
  revalidatePath('/tracks');
  revalidatePath(`/tracks/${parsedId.data}`);
  // It may be in a project, whose page lists it by name.
  revalidatePath('/projects', 'layout');
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
