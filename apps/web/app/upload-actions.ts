'use server';

import { z } from 'zod';
import {
  createUploadRequestSchema,
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

export async function completeUploadAction(
  versionId: unknown,
): Promise<ActionResult<VersionResponse>> {
  const parsed = z.uuid().safeParse(versionId);
  if (!parsed.success) return { ok: false, message: 'Unknown upload.' };
  return toResult(() => serverApi().completeUpload(parsed.data));
}
