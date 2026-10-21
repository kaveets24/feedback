'use server';

import { z } from 'zod';
import {
  createFeedbackRequestSchema,
  createReplyRequestSchema,
  updateFeedbackRequestSchema,
  type FeedbackThread,
} from '@feedback/shared';
import { toResult, type ActionResult } from '../../lib/action-result';
import { serverApi } from '../../lib/api';

// Comment calls to the API, made from the server with the user's session. Server actions are
// public endpoints, so input is checked here as well as by the API. The page refreshes itself
// afterwards, so these don't revalidate.

const id = z.uuid();

const INVALID = 'Comments need some words, up to 2000 characters.';
// The API's 404 is terse; this says what likely happened and what to do.
const GONE = 'That comment or track is gone, or you can no longer see it. Reload the page.';

async function call<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  const result = await toResult(run);
  if (!result.ok && result.message === 'Not found') return { ok: false, message: GONE };
  return result;
}

/** A new comment on a version, at a moment or about all of it. */
export async function createFeedbackAction(
  versionId: unknown,
  input: unknown,
): Promise<ActionResult<FeedbackThread>> {
  const parsedId = id.safeParse(versionId);
  const parsed = createFeedbackRequestSchema.safeParse(input);
  if (!parsedId.success) return { ok: false, message: GONE };
  if (!parsed.success) return { ok: false, message: INVALID };
  return call(() => serverApi().createFeedback(parsedId.data, parsed.data));
}

export async function replyToFeedbackAction(
  feedbackId: unknown,
  input: unknown,
): Promise<ActionResult<FeedbackThread>> {
  const parsedId = id.safeParse(feedbackId);
  const parsed = createReplyRequestSchema.safeParse(input);
  if (!parsedId.success) return { ok: false, message: GONE };
  if (!parsed.success) return { ok: false, message: INVALID };
  return call(() => serverApi().replyToFeedback(parsedId.data, parsed.data));
}

/** Edits a comment's words, or resolves or reopens it. */
export async function updateFeedbackAction(
  feedbackId: unknown,
  input: unknown,
): Promise<ActionResult<FeedbackThread>> {
  const parsedId = id.safeParse(feedbackId);
  const parsed = updateFeedbackRequestSchema.safeParse(input);
  if (!parsedId.success) return { ok: false, message: GONE };
  if (!parsed.success) return { ok: false, message: INVALID };
  return call(() => serverApi().updateFeedback(parsedId.data, parsed.data));
}

export async function deleteFeedbackAction(feedbackId: unknown): Promise<ActionResult<undefined>> {
  const parsedId = id.safeParse(feedbackId);
  if (!parsedId.success) return { ok: false, message: GONE };
  return call(() => serverApi().deleteFeedback(parsedId.data));
}
