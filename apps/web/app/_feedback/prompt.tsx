'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { updateFeedbackPromptAction } from './actions';
import { useFeedbackPlace } from './context';

/**
 * What the artist wants feedback on in this version, above its comments. Listeners read it; the
 * artist (`canEdit`) writes it in place, like the version notes, and can leave it empty.
 */
export function FeedbackPrompt({
  versionId,
  versionNumber,
  prompt,
  canEdit,
}: {
  versionId: string;
  versionNumber: number;
  prompt: string | null;
  canEdit: boolean;
}) {
  const place = useFeedbackPlace();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const openRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      openRef.current?.focus();
    }
  }, [editing]);

  function close() {
    returnFocus.current = true;
    setError(null);
    setEditing(false);
  }

  function save(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateFeedbackPromptAction(versionId, form.get('feedbackPrompt'));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      place.onChanged();
    });
  }

  if (editing) {
    return (
      <form
        action={save}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !pending) close();
        }}
        className="mb-6 max-w-xl space-y-3"
      >
        <label htmlFor={`${id}-prompt`} className="block text-sm font-medium">
          What do you want feedback on in v{versionNumber}?
        </label>
        <textarea
          id={`${id}-prompt`}
          name="feedbackPrompt"
          rows={3}
          maxLength={2000}
          defaultValue={prompt ?? ''}
          placeholder="e.g. Is the vocal too loud in the chorus?"
          autoFocus
          className="field"
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn" onClick={close} disabled={pending}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (!prompt) {
    return canEdit ? (
      <div className="mb-6">
        <button ref={openRef} type="button" className="btn" onClick={() => setEditing(true)}>
          Ask for specific feedback
        </button>
      </div>
    ) : null;
  }

  return (
    <div className="mb-6 max-w-xl rounded-md border border-rule bg-chrome-lo px-4 py-3">
      <p className="text-sm font-medium text-muted">
        {canEdit ? 'You asked for feedback on' : 'The artist wants feedback on'}
      </p>
      <p className="mt-1 break-words whitespace-pre-line text-ink">{prompt}</p>
      {canEdit && (
        <button
          ref={openRef}
          type="button"
          className="btn btn-ghost -mb-1 -ml-2 px-2"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      )}
    </div>
  );
}
