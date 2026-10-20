'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import type { ProjectResponse } from '@feedback/shared';
import { deleteProjectAction, updateProjectAction } from '../actions';

/**
 * The project's name and description, with an Edit mode for both and, inside it, deleting the
 * project. `status` is the status meter, which stays usable in either mode.
 */
export function ProjectDetails({
  project,
  trackCount,
  status,
}: {
  project: ProjectResponse;
  trackCount: number;
  status: ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  const statusRow = (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
      {status}
      <p className="text-sm text-muted">Private: only you can see this project.</p>
      {!editing && (
        <button type="button" className="btn ml-auto" onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
    </div>
  );

  if (editing) {
    return (
      <EditForm
        project={project}
        trackCount={trackCount}
        statusRow={statusRow}
        onDone={() => setEditing(false)}
      />
    );
  }
  return (
    <div>
      <h1 className="text-3xl font-semibold text-balance">{project.title}</h1>
      {project.description && (
        <p className="mt-2 max-w-[65ch] whitespace-pre-line text-muted">{project.description}</p>
      )}
      {statusRow}
    </div>
  );
}

/** The fields, then the status (still live), then deleting, last and set apart. */
function EditForm({
  project,
  trackCount,
  statusRow,
  onDone,
}: {
  project: ProjectResponse;
  trackCount: number;
  statusRow: ReactNode;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await updateProjectAction(project.id, {
        title: form.get('title'),
        description: form.get('description'),
      });
      if (result.ok) onDone();
      else setError(result.message);
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      // On success the action redirects to the projects list.
      const result = await deleteProjectAction(project.id);
      if (!result.ok) setError(result.message);
    });
  }

  const tracks = trackCount === 1 ? '1 track' : `${trackCount} tracks`;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">Edit project</h1>
      <form onSubmit={onSubmit} className="space-y-4" aria-label="Edit project">
        <div>
          <label htmlFor="project-title" className="mb-1 block text-sm font-medium">
            Name
          </label>
          <input
            id="project-title"
            name="title"
            required
            maxLength={200}
            defaultValue={project.title}
            autoFocus
            className="field"
          />
        </div>
        <div>
          <label htmlFor="project-description" className="mb-1 block text-sm font-medium">
            Description <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="project-description"
            name="description"
            rows={3}
            maxLength={2000}
            defaultValue={project.description ?? ''}
            placeholder="What it is, and what you want ears on"
            className="field"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn" onClick={onDone} disabled={pending}>
            Cancel
          </button>
        </div>
      </form>

      {statusRow}

      <section aria-labelledby="delete-heading" className="border-t border-rule pt-5">
        <h2 id="delete-heading" className="text-base font-semibold">
          Delete project
        </h2>
        {confirmingDelete ? (
          <div className="mt-2 space-y-3">
            <p className="max-w-[65ch]">
              Delete “{project.title}”? Its {tracks} will stay in your tracks, with every version.
              You can’t undo this.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="btn btn-danger"
                onClick={onDelete}
                disabled={pending}
                autoFocus
              >
                {pending ? 'Deleting…' : 'Delete project'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setConfirmingDelete(false)}
                disabled={pending}
              >
                Keep project
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 max-w-[65ch] text-sm text-muted">
              Removes the project. Its tracks stay in your tracks.
            </p>
            <button
              type="button"
              className="btn btn-danger mt-3"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete project…
            </button>
          </>
        )}
      </section>
    </div>
  );
}
