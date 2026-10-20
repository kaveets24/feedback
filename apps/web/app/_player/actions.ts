'use server';

import { z } from 'zod';
import { shareTokenSchema, type StreamResponse } from '@feedback/shared';
import { toResult, type ActionResult } from '../../lib/action-result';
import { serverApi, sharedApi } from '../../lib/api';

/**
 * A short-lived URL for a ready version's audio. The API checks the listener may hear it: as the
 * signed-in user, or through `shareToken` for someone listening by a share link. The URL is a
 * bearer credential: never log it, or the token.
 */
export async function getStreamAction(
  versionId: unknown,
  shareToken?: unknown,
): Promise<ActionResult<StreamResponse>> {
  const parsed = z.uuid().safeParse(versionId);
  if (!parsed.success) return { ok: false, message: 'Unknown version.' };
  if (shareToken === undefined) return toResult(() => serverApi().getStream(parsed.data));
  const token = shareTokenSchema.safeParse(shareToken);
  if (!token.success) return { ok: false, message: 'This link doesn’t work.' };
  return toResult(() => sharedApi(token.data).getStream(parsed.data));
}
