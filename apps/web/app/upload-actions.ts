'use server';

import { z } from 'zod';
import {
  ApiError,
  createUploadRequestSchema,
  createVersionRequestSchema,
  type CreateUploadResponse,
  type VersionResponse,
} from '@feedback/shared';
import { toResult, type ActionResult } from '../lib/action-result';
import { serverApi } from '../lib/api';

// The upload form's calls to the API, made from the server with the user's session (the API
// accepts no cross-origin requests). Server actions are public endpoints, so input is checked
// here as well as by the API.

export async function startUploadAction(
  input: unknown,
): Promise<ActionResult<CreateUploadResponse>> {
  const parsed = createUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Check the title and file, then try again.' };
  }
  return toResult(() => serverApi().createUpload(parsed.data));
}

/** Starts uploading a track's next version (the track page's upload form). */
export async function startVersionUploadAction(
  trackId: unknown,
  input: unknown,
): Promise<ActionResult<CreateUploadResponse>> {
  const parsedTrack = z.uuid().safeParse(trackId);
  const parsed = createVersionRequestSchema.safeParse(input);
  if (!parsedTrack.success) return { ok: false, message: 'Unknown track.' };
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Check the file and notes (up to 2000 characters), then try again.',
    };
  }
  // Server errors are rethrown (as `toResult` does); the API's 4xx answers get their own words.
  try {
    return { ok: true, data: await serverApi().createVersion(parsedTrack.data, parsed.data) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // The track was deleted (or isn't yours) since the page loaded.
      return { ok: false, message: 'This track is no longer available. Reload the page.' };
    }
    if (err instanceof ApiError && err.status < 500) {
      return { ok: false, message: 'Couldn’t start the upload. Check the file and try again.' };
    }
    throw err;
  }
}

export async function completeUploadAction(
  versionId: unknown,
): Promise<ActionResult<VersionResponse>> {
  const parsed = z.uuid().safeParse(versionId);
  if (!parsed.success) return { ok: false, message: 'Unknown upload.' };
  return toResult(() => serverApi().completeUpload(parsed.data));
}
