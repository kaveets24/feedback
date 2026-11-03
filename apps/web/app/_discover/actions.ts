'use server';

import { z } from 'zod';
import type { VersionResponse } from '@feedback/shared';
import { toResult, type ActionResult } from '../../lib/action-result';
import { viewerApi } from '../../lib/api';

/**
 * A ready version, for playing it from a list: the player needs its peaks and length. Asked as
 * the viewer (or as nobody, signed out or not yet approved), so it only works on what they may
 * hear.
 */
export async function getPlayableVersionAction(
  versionId: unknown,
): Promise<ActionResult<VersionResponse>> {
  const parsed = z.uuid().safeParse(versionId);
  if (!parsed.success) return { ok: false, message: 'Unknown version.' };
  return toResult(async () => (await viewerApi()).getVersion(parsed.data));
}
