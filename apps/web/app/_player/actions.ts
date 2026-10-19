'use server';

import { z } from 'zod';
import type { StreamResponse } from '@feedback/shared';
import { toResult, type ActionResult } from '../../lib/action-result';
import { serverApi } from '../../lib/api';

/**
 * A short-lived URL for a ready version's audio. The API checks the listener may hear it. The
 * URL is a bearer credential: never log it.
 */
export async function getStreamAction(versionId: unknown): Promise<ActionResult<StreamResponse>> {
  const parsed = z.uuid().safeParse(versionId);
  if (!parsed.success) return { ok: false, message: 'Unknown version.' };
  return toResult(() => serverApi().getStream(parsed.data));
}
