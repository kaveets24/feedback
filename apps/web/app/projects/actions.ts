'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  createCoverRequestSchema,
  createProjectRequestSchema,
  projectStatusSchema,
  updateProjectRequestSchema,
  type CoverResponse,
  type CreateCoverResponse,
  type ProjectResponse,
  type ProjectTracksResponse,
} from '@feedback/shared';
import { toResult, type ActionResult } from '../../lib/action-result';
import { serverApi } from '../../lib/api';

// The project pages' calls to the API, made from the server with the user's session. Server
// actions are public endpoints, so input is checked here as well as by the API.

/** What a form action reports back to its form. */
export type FormState = { message: string } | null;

const id = z.uuid();

// The API's 4xx messages are terse ("Not found"); these say what likely happened and what to do.
// A 404 here means the project or track went away, usually from another tab.
const GONE =
  "Couldn't save: this project may have been deleted or changed in another tab. Reload the page and try again.";
const STALE =
  'That didn’t work because the project changed in another tab. Reload the page and try again.';

/** Changing a project's tracks also changes the track pages and the track list. */
function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  revalidatePath('/tracks/[trackId]', 'page');
}

export async function createProjectAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = createProjectRequestSchema.safeParse({ title: form.get('title') });
  if (!parsed.success) return { message: 'Give the project a name (up to 200 characters).' };

  const result = await toResult(() => serverApi().createProject(parsed.data));
  if (!result.ok) return { message: "Couldn't create the project. Try again." };
  revalidatePath('/projects');
  redirect(`/projects/${result.data.id}`);
}

export async function updateProjectAction(
  projectId: unknown,
  changes: unknown,
): Promise<ActionResult<ProjectResponse>> {
  const parsedId = id.safeParse(projectId);
  const parsed = updateProjectRequestSchema.safeParse(changes);
  if (!parsedId.success || !parsed.success) {
    return { ok: false, message: 'Check the name and description, then try again.' };
  }
  const result = await toResult(() => serverApi().updateProject(parsedId.data, parsed.data));
  if (!result.ok) return { ok: false, message: GONE };
  revalidateProject(parsedId.data);
  return result;
}

export async function setProjectStatusAction(
  projectId: unknown,
  status: unknown,
): Promise<ActionResult<ProjectResponse>> {
  const parsed = projectStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, message: 'Unknown status.' };
  return updateProjectAction(projectId, { status: parsed.data });
}

/** Deletes the project and goes back to the list. Its tracks stay, loose. */
export async function deleteProjectAction(projectId: unknown): Promise<ActionResult<null>> {
  const parsed = id.safeParse(projectId);
  if (!parsed.success) return { ok: false, message: 'Unknown project.' };
  const result = await toResult(() => serverApi().deleteProject(parsed.data));
  if (!result.ok) {
    return { ok: false, message: "Couldn't delete the project. Reload the page and try again." };
  }
  revalidateProject(parsed.data);
  revalidatePath('/');
  redirect('/projects');
}

export async function addProjectTrackAction(_prev: FormState, form: FormData): Promise<FormState> {
  const projectId = id.safeParse(form.get('projectId'));
  const trackId = id.safeParse(form.get('trackId'));
  if (!projectId.success) return { message: 'Unknown project.' };
  if (!trackId.success) return { message: 'Choose a track to add.' };

  const result = await toResult(() => serverApi().addProjectTrack(projectId.data, trackId.data));
  if (!result.ok) return { message: STALE };
  revalidateProject(projectId.data);
  return null;
}

export async function removeProjectTrackAction(
  projectId: unknown,
  trackId: unknown,
): Promise<ActionResult<undefined>> {
  const parsedProject = id.safeParse(projectId);
  const parsedTrack = id.safeParse(trackId);
  if (!parsedProject.success || !parsedTrack.success) {
    return { ok: false, message: 'Unknown track.' };
  }
  const result = await toResult(() =>
    serverApi().removeProjectTrack(parsedProject.data, parsedTrack.data),
  );
  if (!result.ok) return { ok: false, message: STALE };
  revalidateProject(parsedProject.data);
  return result;
}

/** Undoes a removal: adds the track back and restores the order it had. */
export async function restoreProjectTrackAction(
  projectId: unknown,
  trackId: unknown,
  trackIds: unknown,
): Promise<ActionResult<ProjectTracksResponse>> {
  const parsedProject = id.safeParse(projectId);
  const parsedTrack = id.safeParse(trackId);
  const parsedOrder = z.array(id).safeParse(trackIds);
  if (!parsedProject.success || !parsedTrack.success || !parsedOrder.success) {
    return { ok: false, message: 'Unknown track.' };
  }
  const api = serverApi();
  const added = await toResult(() => api.addProjectTrack(parsedProject.data, parsedTrack.data));
  // Added back at the end; put it where it was. A stale order just leaves it at the end.
  const result = added.ok
    ? await toResult(() => api.reorderProjectTracks(parsedProject.data, parsedOrder.data))
    : added;
  if (added.ok) revalidateProject(parsedProject.data);
  return result.ok ? result : { ok: false, message: STALE };
}

export async function reorderProjectTracksAction(
  projectId: unknown,
  trackIds: unknown,
): Promise<ActionResult<ProjectTracksResponse>> {
  const parsedProject = id.safeParse(projectId);
  const parsedTracks = z.array(id).safeParse(trackIds);
  if (!parsedProject.success || !parsedTracks.success) {
    return { ok: false, message: 'Unknown tracks.' };
  }
  const result = await toResult(() =>
    serverApi().reorderProjectTracks(parsedProject.data, parsedTracks.data),
  );
  if (!result.ok) return { ok: false, message: STALE };
  revalidateProject(parsedProject.data);
  return result;
}

/**
 * The track page's project selector: moves the track into the chosen project, or out of its
 * current one when "Not in a project" is chosen.
 */
export async function setTrackProjectAction(_prev: FormState, form: FormData): Promise<FormState> {
  const trackId = id.safeParse(form.get('trackId'));
  const from = id.or(z.literal('')).safeParse(form.get('fromProjectId') ?? '');
  const to = id.or(z.literal('')).safeParse(form.get('projectId') ?? '');
  if (!trackId.success || !from.success || !to.success) return { message: 'Unknown project.' };
  if (from.data === to.data) return null;

  const api = serverApi();
  const result = await toResult(() =>
    to.data
      ? api.addProjectTrack(to.data, trackId.data)
      : api.removeProjectTrack(from.data, trackId.data),
  );
  if (!result.ok) return { message: STALE };
  if (from.data) revalidateProject(from.data);
  if (to.data) revalidateProject(to.data);
  revalidatePath(`/tracks/${trackId.data}`);
  return null;
}

/** Starts uploading cover art; the browser then PUTs the image to the returned URL. */
export async function startCoverUploadAction(
  projectId: unknown,
  input: unknown,
): Promise<ActionResult<CreateCoverResponse>> {
  const parsedId = id.safeParse(projectId);
  const parsed = createCoverRequestSchema.safeParse(input);
  if (!parsedId.success) return { ok: false, message: 'Unknown project.' };
  if (!parsed.success) {
    return { ok: false, message: 'Choose a JPEG, PNG, or WebP image up to 10 MB.' };
  }
  const result = await toResult(() => serverApi().startCoverUpload(parsedId.data, parsed.data));
  return result.ok ? result : { ok: false, message: GONE };
}

/** Hands an uploaded cover to the worker. Safe to repeat. */
export async function completeCoverUploadAction(
  projectId: unknown,
  coverId: unknown,
): Promise<ActionResult<CoverResponse>> {
  const parsedProject = id.safeParse(projectId);
  const parsedCover = id.safeParse(coverId);
  if (!parsedProject.success || !parsedCover.success) {
    return { ok: false, message: 'Unknown cover.' };
  }
  const result = await toResult(() =>
    serverApi().completeCoverUpload(parsedProject.data, parsedCover.data),
  );
  if (result.ok) revalidateProject(parsedProject.data);
  return result.ok
    ? result
    : { ok: false, message: "The image uploaded, but we couldn't start processing it. Try again." };
}

/** A cover upload's state, for the project page to poll while it processes. */
export async function getCoverAction(
  projectId: unknown,
  coverId: unknown,
): Promise<ActionResult<CoverResponse>> {
  const parsedProject = id.safeParse(projectId);
  const parsedCover = id.safeParse(coverId);
  if (!parsedProject.success || !parsedCover.success) {
    return { ok: false, message: 'Unknown cover.' };
  }
  return toResult(() => serverApi().getCover(parsedProject.data, parsedCover.data));
}

/** Takes the project's cover art off. */
export async function removeCoverAction(projectId: unknown): Promise<ActionResult<undefined>> {
  const parsed = id.safeParse(projectId);
  if (!parsed.success) return { ok: false, message: 'Unknown project.' };
  const result = await toResult(() => serverApi().removeCover(parsed.data));
  if (!result.ok) return { ok: false, message: GONE };
  revalidateProject(parsed.data);
  return result;
}
