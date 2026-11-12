'use server';

import { z } from 'zod';
import { shareTokenSchema, type StreamResponse } from '@feedback/shared';
import { toResult, type ActionResult } from '../../lib/action-result';
import { sharedApi, viewerApi } from '../../lib/api';

/**
 * A short-lived URL for a ready version's audio. The API checks the listener may hear it: as the
 * signed-in user (or as nobody, for a public track and an account not yet approved), or through
 * `shareToken` for someone listening by a share link. The URL is a
 * bearer credential: never log it, or the token.
 */
export async function getStreamAction(
  versionId: unknown,
  shareToken?: unknown,
): Promise<ActionResult<StreamResponse>> {
  const parsed = z.uuid().safeParse(versionId);
  if (!parsed.success) return { ok: false, message: 'Unknown version.' };
  if (shareToken === undefined)
    return toResult(async () => (await viewerApi()).getStream(parsed.data));
  const token = shareTokenSchema.safeParse(shareToken);
  if (!token.success) return { ok: false, message: 'This link doesn’t work.' };
  return toResult(() => sharedApi(token.data).getStream(parsed.data));
}

/**
 * A ready version's waveform and length, for an item a list built without them. Asked as the
 * viewer (or as nobody, signed out or not yet approved), or through `shareToken`, so it only
 * works on what the listener may hear.
 */
export async function getWaveformAction(
  versionId: unknown,
  shareToken?: unknown,
): Promise<ActionResult<{ peaks: number[]; durationMs: number }>> {
  const parsed = z.uuid().safeParse(versionId);
  if (!parsed.success) return { ok: false, message: 'Unknown version.' };
  const token = shareToken === undefined ? undefined : shareTokenSchema.safeParse(shareToken);
  if (token && !token.success) return { ok: false, message: 'This link doesn’t work.' };
  return toResult(async () => {
    const api = token ? sharedApi(token.data) : await viewerApi();
    const version = await api.getVersion(parsed.data);
    return { peaks: version.waveformPeaks ?? [], durationMs: version.durationMs ?? 0 };
  });
}
