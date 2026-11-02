import type { FeedbackAction } from '@feedback/authz';
import { findProject, type Db, type Feedback, type Project, type Track } from '@feedback/db';
import type {
  CreateFeedbackRequest,
  CreateReplyRequest,
  FeedbackAuthor,
  FeedbackListResponse,
  FeedbackReply,
  FeedbackThread,
  UpdateFeedbackRequest,
} from '@feedback/shared';
import type { Storage } from '@feedback/storage';
import { canAccessTrack, canAccessTrackFeedback } from '../../auth/authz.ts';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import { COVER_URL_SECONDS } from '../covers/images.ts';
import { loadVersionFor } from '../versions/service.ts';
import { insertNotification } from '../notifications/repo.ts';
import { findAuthors, findFeedback, insertFeedback, listFeedback, updateFeedback } from './repo.ts';

// Comments on a track's versions (CLAUDE.md section 5). Every decision about a comment goes
// through canAccessTrackFeedback, which first requires viewing the track: anyone who can't gets
// the usual 404, so a comment never reveals a track. Someone who can see a comment but may not do
// what they asked gets a 403, and an anonymous visitor asking to write gets a 401.

export interface FeedbackDeps {
  db: Db;
  storage: Storage;
}

/** The track a set of comments is on, and its live project, for permission checks. */
interface TrackScope {
  track: Track;
  project: Project | null;
}

const notFound = () => httpError(404, 'NOT_FOUND', 'Not found');
const signInToComment = () => httpError(401, 'UNAUTHENTICATED', 'Sign in to comment');

/** Every comment on a version the actor may view, in threads. */
export async function getFeedback(
  deps: FeedbackDeps,
  actor: Actor,
  versionId: string,
): Promise<FeedbackListResponse> {
  const { track, project } = await loadVersionFor(deps.db, actor, versionId, 'view');
  const rows = await listFeedback(deps.db, { versionId });
  return { threads: await toThreads(deps, actor, { track, project }, rows) };
}

/** A new top-level comment, at a moment in the version or about all of it. */
export async function createFeedback(
  deps: FeedbackDeps,
  actor: Actor,
  versionId: string,
  input: CreateFeedbackRequest,
): Promise<FeedbackThread> {
  const { track, project, version } = await loadVersionFor(deps.db, actor, versionId, 'view');
  if (actor.kind === 'anonymous') throw signInToComment();
  if (!canAccessTrack(actor, track, project, 'comment')) throw notFound();
  if (version.status !== 'ready' || version.durationMs === null) {
    throw httpError(409, 'VERSION_NOT_READY', 'This version is not ready for feedback yet');
  }
  const timestampMs = input.timestampMs ?? null;
  if (timestampMs !== null && timestampMs > version.durationMs) {
    throw httpError(400, 'TIMESTAMP_OUT_OF_RANGE', 'That moment is past the end of the version');
  }

  const row = await insertFeedback(deps.db, {
    trackVersionId: version.id,
    authorId: actor.user.id,
    body: input.body,
    timestampMs,
  });
  await notifyArtist(deps.db, track, row, 'comment');
  return threadOf(deps, actor, { track, project }, row.id);
}

/** Answers a top-level comment. Replies go one level deep. */
export async function replyToFeedback(
  deps: FeedbackDeps,
  actor: Actor,
  feedbackId: string,
  input: CreateReplyRequest,
): Promise<FeedbackThread> {
  const { feedback: parent, scope } = await loadFeedbackFor(deps.db, actor, feedbackId);
  if (parent.parentId !== null) {
    throw httpError(400, 'NOT_A_THREAD', 'Reply to the comment that started the thread');
  }
  if (actor.kind === 'anonymous') throw signInToComment();
  ensureAllowed(actor, scope, parent, 'reply');

  const reply = await insertFeedback(deps.db, {
    trackVersionId: parent.trackVersionId,
    parentId: parent.id,
    authorId: actor.user.id,
    body: input.body,
  });
  await notifyArtist(deps.db, scope.track, reply, 'reply');
  return threadOf(deps, actor, scope, parent.id);
}

/**
 * Edits a comment's body (its author) or resolves and reopens a top-level comment (the artist).
 * Returns the thread it's in.
 */
export async function editFeedback(
  deps: FeedbackDeps,
  actor: Actor,
  feedbackId: string,
  input: UpdateFeedbackRequest,
): Promise<FeedbackThread> {
  const { feedback: row, scope } = await loadFeedbackFor(deps.db, actor, feedbackId);
  const changes: Parameters<typeof updateFeedback>[2] = {};
  if (input.body !== undefined) {
    ensureAllowed(actor, scope, row, 'edit');
    changes.body = input.body;
  }
  if (input.status !== undefined) {
    if (row.parentId !== null) {
      throw httpError(400, 'NOT_A_THREAD', 'Only the comment that started a thread is resolved');
    }
    ensureAllowed(actor, scope, row, 'resolve');
    if (input.status !== row.status) {
      changes.status = input.status;
      changes.resolvedAt = input.status === 'resolved' ? new Date() : null;
    }
  }
  // Null only if it was deleted since it was loaded. Reopening an open comment changes nothing.
  if (Object.keys(changes).length > 0 && !(await updateFeedback(deps.db, row.id, changes))) {
    throw notFound();
  }
  return threadOf(deps, actor, scope, row.parentId ?? row.id);
}

/**
 * Deletes a comment (its author, or the artist). It's only marked deleted: a top-level comment
 * with replies keeps its place in the thread, without its body or author. Repeating it is fine.
 */
export async function deleteFeedback(
  deps: FeedbackDeps,
  actor: Actor,
  feedbackId: string,
): Promise<void> {
  const found = await findFeedback(deps.db, feedbackId);
  if (!found) throw notFound();
  const scope = await scopeOf(deps.db, found.track);
  if (!canAccessTrackFeedback(actor, scope.track, scope.project, found.feedback, 'read')) {
    throw notFound();
  }
  if (found.feedback.deletedAt) return;
  ensureAllowed(actor, scope, found.feedback, 'delete');
  await updateFeedback(deps.db, feedbackId, { deletedAt: new Date() });
}

/** Tells the artist about someone else's comment or reply on their track. */
async function notifyArtist(db: Db, track: Track, row: Feedback, type: 'comment' | 'reply') {
  if (row.authorId === track.ownerId) return;
  await insertNotification(db, { userId: track.ownerId, type, feedbackId: row.id });
}

async function scopeOf(db: Db, track: Track): Promise<TrackScope> {
  return { track, project: track.projectId ? await findProject(db, track.projectId) : null };
}

/** A live comment the actor may read, with its track; anything else is a 404. */
async function loadFeedbackFor(
  db: Db,
  actor: Actor,
  feedbackId: string,
): Promise<{ feedback: Feedback; scope: TrackScope }> {
  const found = await findFeedback(db, feedbackId);
  if (!found || found.feedback.deletedAt) throw notFound();
  const scope = await scopeOf(db, found.track);
  if (!canAccessTrackFeedback(actor, scope.track, scope.project, found.feedback, 'read')) {
    throw notFound();
  }
  return { feedback: found.feedback, scope };
}

/** Throws a 403 unless the actor may do `action` (they can already see the comment). */
function ensureAllowed(actor: Actor, scope: TrackScope, row: Feedback, action: FeedbackAction) {
  if (!canAccessTrackFeedback(actor, scope.track, scope.project, row, action)) {
    throw httpError(403, 'FORBIDDEN', 'You can’t do that to this comment');
  }
}

/** One thread, as the actor sees it. */
async function threadOf(
  deps: FeedbackDeps,
  actor: Actor,
  scope: TrackScope,
  threadId: string,
): Promise<FeedbackThread> {
  const [thread] = await toThreads(deps, actor, scope, await listFeedback(deps.db, { threadId }));
  // A thread just written to always has a live top-level comment, so it's always shown.
  if (!thread) throw notFound();
  return thread;
}

/**
 * Groups comments into threads, in the order given, with each author's name and picture and what
 * the actor may do with each comment. Deleted replies are left out, and so is a deleted top-level
 * comment, unless replies are left under it.
 */
async function toThreads(
  { db, storage }: FeedbackDeps,
  actor: Actor,
  scope: TrackScope,
  rows: Feedback[],
): Promise<FeedbackThread[]> {
  const live = rows.filter((row) => !row.deletedAt);
  const authors = await authorsFor(db, storage, [...new Set(live.map((row) => row.authorId))]);
  const can = (row: Feedback) => {
    const allowed = (action: FeedbackAction) =>
      !row.deletedAt && canAccessTrackFeedback(actor, scope.track, scope.project, row, action);
    return {
      reply: row.parentId === null && allowed('reply'),
      edit: allowed('edit'),
      delete: allowed('delete'),
      resolve: row.parentId === null && allowed('resolve'),
    };
  };
  const toReply = (row: Feedback): FeedbackReply => ({
    id: row.id,
    body: row.deletedAt ? null : row.body,
    deleted: row.deletedAt !== null,
    author: row.deletedAt ? null : (authors.get(row.authorId) ?? noProfile),
    createdAt: row.createdAt.toISOString(),
    can: can(row),
  });

  const replies = new Map<string, FeedbackReply[]>();
  for (const row of live) {
    if (row.parentId)
      replies.set(row.parentId, [...(replies.get(row.parentId) ?? []), toReply(row)]);
  }
  return rows
    .filter((row) => row.parentId === null && (!row.deletedAt || replies.has(row.id)))
    .map((row) => ({
      ...toReply(row),
      timestampMs: row.timestampMs,
      status: row.status,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      replies: replies.get(row.id) ?? [],
    }));
}

const noProfile: FeedbackAuthor = { displayName: null, handle: null, avatar: null };

/** Each author's name and picture (a short-lived signed URL, like covers), by user id. */
export async function authorsFor(
  db: Db,
  storage: Storage,
  userIds: string[],
): Promise<Map<string, FeedbackAuthor>> {
  const found = await findAuthors(db, userIds);
  const expiresAt = new Date(Date.now() + COVER_URL_SECONDS * 1000).toISOString();
  const entries = await Promise.all(
    [...found].map(async ([userId, { displayName, handle, avatarKey }]) => {
      const avatar = avatarKey
        ? {
            url: await storage.presignDownload({ key: avatarKey, expiresIn: COVER_URL_SECONDS }),
            expiresAt,
          }
        : null;
      return [userId, { displayName, handle, avatar }] as const;
    }),
  );
  return new Map(entries);
}
