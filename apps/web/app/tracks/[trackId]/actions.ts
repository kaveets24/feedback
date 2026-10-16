'use server';

import { z } from 'zod';
import type { VersionResponse } from '@feedback/shared';
import { toResult, type ActionResult } from '../../../lib/action-result';
import { serverApi } from '../../../lib/api';

/** A version's current state, for the track page to poll while it processes. */
export async function getVersionAction(versionId: unknown): Promise<ActionResult<VersionResponse>> {
  const parsed = z.uuid().safeParse(versionId);
  if (!parsed.success) return { ok: false, message: 'Unknown version.' };
  return toResult(() => serverApi().getVersion(parsed.data));
}
