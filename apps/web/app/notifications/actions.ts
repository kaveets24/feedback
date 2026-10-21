'use server';

import { z } from 'zod';
import { toResult, type ActionResult } from '../../lib/action-result';
import { serverApi } from '../../lib/api';

/** Marks notifications read once they've been shown. */
export async function markReadAction(ids: unknown): Promise<ActionResult<undefined>> {
  const parsed = z.array(z.uuid()).min(1).max(100).safeParse(ids);
  if (!parsed.success) return { ok: false, message: 'Unknown notifications.' };
  return toResult(() => serverApi().markNotificationsRead(parsed.data));
}
