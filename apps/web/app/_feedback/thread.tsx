'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type ReactNode } from 'react';
import { MAX_FEEDBACK_LENGTH, type FeedbackReply, type FeedbackThread } from '@feedback/shared';
import type { ActionResult } from '../../lib/action-result';
import { formatDate, formatDuration } from '../../lib/format';
import { Avatar } from '../_shell/avatar';
import { deleteFeedbackAction, replyToFeedbackAction, updateFeedbackAction } from './actions';

/** A comment's actions are ghost buttons (repeated row actions), narrowed to sit in a line. */
const ACTION = 'btn btn-ghost px-2';

/** Runs an action, then refreshes the page's data; reports a failure through `onError`. */
function useMutation(onError: (message: string | null) => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult<unknown>>, onDone?: () => void) => {
    onError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        onError(result.message);
        return;
      }
      onDone?.();
      router.refresh();
    });
  };
  return { pending, run };
}

/**
 * One top-level comment with its replies. Its moment (if pinned) plays the version from there;
 * what you can do with it (reply, edit, delete, resolve) comes from the API's `can`, never decided
 * here.
 */
export function Thread({
  thread,
  highlighted,
  onPlayAt,
}: {
  thread: FeedbackThread;
  /** Picked from the waveform's markers: lit like the version in the player. */
  highlighted: boolean;
  onPlayAt: (ms: number) => void;
}) {
  const [replying, setReplying] = useState(false);
  const resolved = thread.status === 'resolved';
  const { timestampMs } = thread;

  return (
    <li
      id={`feedback-${thread.id}`}
      data-highlighted={highlighted || undefined}
      // Lit like the version in the player: the fill bleeds 12px into the gutter without moving the
      // content or the rules.
      className="relative isolate grid scroll-mt-24 grid-cols-[3.5rem_1fr] gap-x-3 border-b border-rule py-3 data-highlighted:before:absolute data-highlighted:before:inset-y-0 data-highlighted:before:-inset-x-3 data-highlighted:before:-z-10 data-highlighted:before:bg-chrome-lo data-highlighted:before:shadow-[inset_2px_0_0_var(--color-accent)]"
    >
      <div className="pt-0.5">
        {timestampMs !== null ? (
          <button
            type="button"
            className="focus-glow rounded-sm font-lcd text-base text-ink tabular-nums hover:text-accent"
            aria-label={`Play from ${formatDuration(timestampMs)}`}
            onClick={() => onPlayAt(timestampMs)}
          >
            {formatDuration(timestampMs)}
          </button>
        ) : (
          <span className="text-muted" title="About the whole version">
            —<span className="sr-only">General comment</span>
          </span>
        )}
      </div>
      <div className="min-w-0">
        <Comment
          comment={thread}
          resolved={resolved}
          showResolved
          extraActions={
            <>
              {thread.can.reply && (
                <button type="button" className={ACTION} onClick={() => setReplying(true)}>
                  Reply
                </button>
              )}
              {thread.can.resolve && <ResolveButton thread={thread} />}
            </>
          }
        />
        {(thread.replies.length > 0 || replying) && (
          <ul className="mt-2 space-y-3 border-l border-rule pl-4">
            {thread.replies.map((reply) => (
              <li key={reply.id}>
                <Comment comment={reply} resolved={resolved} />
              </li>
            ))}
            {replying && (
              <li>
                <ReplyForm threadId={thread.id} onClose={() => setReplying(false)} />
              </li>
            )}
          </ul>
        )}
      </div>
    </li>
  );
}

/**
 * A comment's byline, words, and own actions (edit and delete, plus any `extraActions`). A resolved
 * thread's words go muted, replies included; `showResolved` says so in the byline (top-level only).
 */
function Comment({
  comment,
  resolved,
  showResolved = false,
  extraActions,
}: {
  comment: FeedbackReply;
  resolved: boolean;
  showResolved?: boolean;
  extraActions?: ReactNode;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useMutation(setError);

  if (comment.deleted) {
    return <p className="text-muted">This comment was deleted.</p>;
  }

  return (
    <article>
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <Avatar avatar={comment.author?.avatar ?? null} size="inline" />
        <span className="font-medium break-words text-ink">
          {comment.author?.displayName ?? <span className="text-muted">Someone</span>}
        </span>
        <span className="text-muted">
          <time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
        </span>
        {resolved && showResolved && (
          <span className="font-lcd text-xs text-muted uppercase">Resolved</span>
        )}
      </p>

      {mode === 'edit' ? (
        <EditForm
          comment={comment}
          pending={pending}
          onSave={(body) =>
            run(
              () => updateFeedbackAction(comment.id, { body }),
              () => setMode('view'),
            )
          }
          onCancel={() => {
            setError(null);
            setMode('view');
          }}
        />
      ) : (
        <p
          className={`mt-1 break-words whitespace-pre-line ${resolved ? 'text-muted' : 'text-ink'}`}
        >
          {comment.body}
        </p>
      )}

      {mode === 'delete' ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm">Delete this comment? This can’t be undone.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              onClick={() => run(() => deleteFeedbackAction(comment.id))}
            >
              {pending ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => setMode('view')}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        mode === 'view' && (
          <div className="-ml-2 flex flex-wrap gap-x-1">
            {extraActions}
            {comment.can.edit && (
              <button type="button" className={ACTION} onClick={() => setMode('edit')}>
                Edit
              </button>
            )}
            {comment.can.delete && (
              <button type="button" className={ACTION} onClick={() => setMode('delete')}>
                Delete
              </button>
            )}
          </div>
        )
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </article>
  );
}

/** Resolve or reopen a thread (the artist). */
function ResolveButton({ thread }: { thread: FeedbackThread }) {
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useMutation(setError);
  const resolved = thread.status === 'resolved';
  return (
    <>
      <button
        type="button"
        className={ACTION}
        disabled={pending}
        onClick={() =>
          run(() => updateFeedbackAction(thread.id, { status: resolved ? 'open' : 'resolved' }))
        }
      >
        {resolved ? 'Reopen' : 'Resolve'}
      </button>
      {error && (
        <span role="alert" className="inline-flex min-h-10 items-center text-sm text-danger">
          {error}
        </span>
      )}
    </>
  );
}

function EditForm({
  comment,
  pending,
  onSave,
  onCancel,
}: {
  comment: FeedbackReply;
  pending: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [body, setBody] = useState(comment.body ?? '');
  return (
    <form
      className="mt-2 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(body);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !pending) onCancel();
      }}
    >
      <label htmlFor={`${id}-body`} className="sr-only">
        Edit your comment
      </label>
      <textarea
        id={`${id}-body`}
        rows={3}
        maxLength={MAX_FEEDBACK_LENGTH}
        value={body}
        autoFocus
        onChange={(event) => setBody(event.target.value)}
        className="field"
      />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending || !body.trim()}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ReplyForm({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const id = useId();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useMutation(setError);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => replyToFeedbackAction(threadId, { body }), onClose);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !pending) onClose();
      }}
    >
      <label htmlFor={`${id}-body`} className="block text-sm font-medium">
        Your reply
      </label>
      <textarea
        id={`${id}-body`}
        rows={2}
        maxLength={MAX_FEEDBACK_LENGTH}
        value={body}
        autoFocus
        onChange={(event) => setBody(event.target.value)}
        className="field"
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending || !body.trim()}>
          {pending ? 'Replying…' : 'Reply'}
        </button>
        <button type="button" className="btn" disabled={pending} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
