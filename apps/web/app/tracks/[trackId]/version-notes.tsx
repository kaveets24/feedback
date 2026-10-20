'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { EditIcon } from '../../_shell/icons';
import { updateVersionNotesAction } from './actions';

/**
 * One row of the version history: the V-number, the change notes over the meta line (`meta`),
 * the length column (`length`, from `sm`), and an edit button. Editing happens in place: the notes
 * become a textarea with Save and Cancel, Escape cancels (unless a save is under way), and focus
 * goes back to the edit button afterwards.
 */
export function VersionRow({
  versionId,
  versionNumber,
  notes,
  meta,
  length,
}: {
  versionId: string;
  versionNumber: number;
  notes: string | null;
  meta: ReactNode;
  length: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      editRef.current?.focus();
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
      const result = await updateVersionNotesAction(versionId, form.get('changeNotes'));
      if (result.ok) close();
      else setError(result.message);
    });
  }

  const number = (
    <span className="pt-0.5 font-lcd text-base text-ink tabular-nums">V{versionNumber}</span>
  );

  if (editing) {
    const fieldId = `notes-${versionId}`;
    return (
      // Same columns as the row at rest, so the length stays put while the notes are edited.
      <div className="grid grid-cols-[2.5rem_1fr] items-start gap-x-3 sm:grid-cols-[3rem_1fr_4rem_2.5rem]">
        {number}
        <form
          action={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !pending) close();
          }}
          className="space-y-3"
        >
          {meta}
          <label htmlFor={fieldId} className="block text-sm font-medium">
            What changed in v{versionNumber}?
          </label>
          <textarea
            id={fieldId}
            name="changeNotes"
            rows={3}
            maxLength={2000}
            defaultValue={notes ?? ''}
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
        {length}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[2.5rem_1fr_auto] items-start gap-x-3 sm:grid-cols-[3rem_1fr_4rem_auto]">
      {number}
      <div className="min-w-0">
        {notes ? (
          <p className="break-words whitespace-pre-line">{notes}</p>
        ) : (
          <p className="text-muted">No change notes.</p>
        )}
        {meta}
      </div>
      {length}
      <button
        ref={editRef}
        type="button"
        className="btn btn-ghost btn-icon -mt-2"
        aria-label={`Edit notes for v${versionNumber}`}
        title="Edit notes"
        onClick={() => setEditing(true)}
      >
        <EditIcon />
      </button>
    </div>
  );
}
