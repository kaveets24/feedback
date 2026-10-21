'use server';

import { z } from 'zod';
import { profileParamsSchema } from '@feedback/shared';
import { toResult, type ActionResult } from '../../../lib/action-result';
import { serverApi } from '../../../lib/api';

/** Follows (true) or unfollows (false) someone by their handle. The page refreshes afterwards. */
export async function setFollowingAction(
  handle: unknown,
  follow: unknown,
): Promise<ActionResult<undefined>> {
  const parsedHandle = profileParamsSchema.shape.handle.safeParse(handle);
  const parsedFollow = z.boolean().safeParse(follow);
  if (!parsedHandle.success || !parsedFollow.success) {
    return { ok: false, message: 'That page is gone. Reload it.' };
  }
  const api = serverApi();
  return toResult(() =>
    parsedFollow.data
      ? api.followProfile(parsedHandle.data)
      : api.unfollowProfile(parsedHandle.data),
  );
}
