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

/** Renames the track. */
export async function renameTrackAction(
  trackId: unknown,
  title: unknown,
): Promise<ActionResult<TrackResponse>> {
  const parsedId = z.uuid().safeParse(trackId);
  const parsed = trackTitleSchema.safeParse(title);
  if (!parsedId.success) return { ok: false, message: 'Unknown track.' };
  if (!parsed.success)
    return { ok: false, message: 'Give the track a title, up to 200 characters.' };

  const result = await toResult(() =>
    serverApi().updateTrack(parsedId.data, { title: parsed.data }),
  );
  if (!result.ok) {
    return { ok: false, message: "Couldn't rename the track. Reload the page and try again." };
  }
  revalidatePath('/tracks');
  revalidatePath(`/tracks/${parsedId.data}`);
  // It may be in a project, whose page lists it by name.
  revalidatePath('/projects', 'layout');
  return result;
}

/** Files the track under a genre; an empty value clears it. */
export async function setTrackGenreAction(
  trackId: unknown,
  genre: unknown,
): Promise<ActionResult<TrackResponse>> {
  const parsedId = z.uuid().safeParse(trackId);
  const parsed = genreSchema.nullable().safeParse(genre === '' ? null : genre);
  if (!parsedId.success) return { ok: false, message: 'Unknown track.' };
  if (!parsed.success) return { ok: false, message: 'Pick a genre from the list.' };

  const result = await toResult(() =>
    serverApi().updateTrack(parsedId.data, { genre: parsed.data }),
  );
  if (!result.ok) {
    return { ok: false, message: "Couldn't save the genre. Reload the page and try again." };
  }
  revalidatePath(`/tracks/${parsedId.data}`);
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
