'use server';

import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import {
  ApiError,
  createFeedbackRequestSchema,
  createReplyRequestSchema,
  shareTokenSchema,
  updateFeedbackRequestSchema,
  updateVersionRequestSchema,
  type FeedbackListResponse,
  type FeedbackThread,
  type VersionResponse,
} from '@feedback/shared';
import { toResult, type ActionResult } from '../../lib/action-result';
import { getMe, serverApi, sharedApi, sharedApiAs } from '../../lib/api';

// Comment calls to the API. On the track page they go with the user's session; on the listen
// page, with the share link's token too (`shareToken`), so the link counts. Server actions are
// public endpoints, so input is checked here as well as by the API. The page refreshes its own
// data afterwards, so these don't revalidate.

const id = z.uuid();

const INVALID = 'Comments need some words, up to 2000 characters.';
// The API's 404 is terse; this says what likely happened and what to do.
const GONE = 'That comment or track is gone, or you can no longer see it. Reload the page.';

/** Who's at the listen page, for what the comment box offers them. */
export type Listener = 'anonymous' | 'pending' | 'approved' | 'rejected';

export async function listenerAction(): Promise<Listener> {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return 'anonymous';
  return (await getMe()).accessStatus;
}

/** The API client for a write: the session, plus the link if there is one; null for a bad link. */
function writer(shareToken: unknown) {
  if (shareToken === undefined) return serverApi();
  const parsed = shareTokenSchema.safeParse(shareToken);
  return parsed.success ? sharedApiAs(parsed.data) : null;
}

async function call<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  const result = await toResult(run);
  if (!result.ok && result.message === 'Not found') return { ok: false, message: GONE };
  return result;
}

/**
 * A version's comments through a share link. An approved, signed-in visitor asks as themselves,
 * so the API says what they may do with each comment; anyone else asks as the link alone.
 */
export async function listSharedFeedbackAction(
  shareToken: unknown,
  versionId: unknown,
): Promise<ActionResult<FeedbackListResponse>> {
  const token = shareTokenSchema.safeParse(shareToken);
  const parsedId = id.safeParse(versionId);
  if (!token.success || !parsedId.success) return { ok: false, message: GONE };
  const asSelf = (await listenerAction()) === 'approved';
  const api = asSelf ? sharedApiAs(token.data) : sharedApi(token.data);
  try {
    return await call(() => api.listFeedback(parsedId.data));
  } catch (err) {
    // Anything else (the API down, say) reads as no comments for now rather than a broken page.
    if (err instanceof ApiError) return { ok: false, message: "Couldn't load the comments." };
    throw err;
  }
}

/** A new comment on a version, at a moment or about all of it. */
export async function createFeedbackAction(
  versionId: unknown,
  input: unknown,
  shareToken?: unknown,
): Promise<ActionResult<FeedbackThread>> {
  const api = writer(shareToken);
  const parsedId = id.safeParse(versionId);
  const parsed = createFeedbackRequestSchema.safeParse(input);
  if (!api || !parsedId.success) return { ok: false, message: GONE };
  if (!parsed.success) return { ok: false, message: INVALID };
  return call(() => api.createFeedback(parsedId.data, parsed.data));
}

export async function replyToFeedbackAction(
  feedbackId: unknown,
  input: unknown,
  shareToken?: unknown,
): Promise<ActionResult<FeedbackThread>> {
  const api = writer(shareToken);
  const parsedId = id.safeParse(feedbackId);
  const parsed = createReplyRequestSchema.safeParse(input);
  if (!api || !parsedId.success) return { ok: false, message: GONE };
  if (!parsed.success) return { ok: false, message: INVALID };
  return call(() => api.replyToFeedback(parsedId.data, parsed.data));
}

/** Edits a comment's words, or resolves or reopens it. */
export async function updateFeedbackAction(
  feedbackId: unknown,
  input: unknown,
  shareToken?: unknown,
): Promise<ActionResult<FeedbackThread>> {
  const api = writer(shareToken);
  const parsedId = id.safeParse(feedbackId);
  const parsed = updateFeedbackRequestSchema.safeParse(input);
  if (!api || !parsedId.success) return { ok: false, message: GONE };
  if (!parsed.success) return { ok: false, message: INVALID };
  return call(() => api.updateFeedback(parsedId.data, parsed.data));
}

export async function deleteFeedbackAction(
  feedbackId: unknown,
  shareToken?: unknown,
): Promise<ActionResult<undefined>> {
  const api = writer(shareToken);
  const parsedId = id.safeParse(feedbackId);
  if (!api || !parsedId.success) return { ok: false, message: GONE };
  return call(() => api.deleteFeedback(parsedId.data));
}

/** What the artist wants feedback on in a version (the owner, on the track page). */
export async function updateFeedbackPromptAction(
  versionId: unknown,
  prompt: unknown,
): Promise<ActionResult<VersionResponse>> {
  const parsedId = id.safeParse(versionId);
  const parsed = updateVersionRequestSchema.safeParse({ feedbackPrompt: prompt });
  if (!parsedId.success) return { ok: false, message: GONE };
  if (!parsed.success) return { ok: false, message: 'Keep it to 2000 characters.' };
  return call(() => serverApi().updateVersion(parsedId.data, parsed.data));
}
