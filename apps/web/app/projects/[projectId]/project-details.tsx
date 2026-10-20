'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import type { CoverImage, ProjectDetailResponse } from '@feedback/shared';
import { deleteProjectAction, removeCoverAction, updateProjectAction } from '../actions';
import { ProjectCover } from '../project-cover';
import { CoverControl } from './cover-control';

/**
 * The project's cover, name, and description, with an Edit mode for the words and, inside it,
 * removing the cover and deleting the project. `releaseType` is the release type picker, usable
 * in either mode.
 */
export function ProjectDetails({
  project,
  trackCount,
  releaseType,
}: {
  project: ProjectDetailResponse;
  trackCount: number;
  releaseType: ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  const typeRow = (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
      {releaseType}
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
        typeRow={typeRow}
        onDone={() => setEditing(false)}
      />
    );
  }
  const pending = project.coverUpload;
  return (
    <div>
      <div className="flex items-start gap-4 sm:gap-6">
        <ProjectCover cover={project.cover} size="page" alt={`Cover art for ${project.title}`} />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold break-words text-balance">{project.title}</h1>
          {project.description && (
            <p className="mt-2 max-w-[65ch] whitespace-pre-line text-muted">
              {project.description}
            </p>
          )}
          <div className="mt-2">
            {/* Keyed on the server's view, so a refresh after processing starts it afresh. */}
            <CoverControl
              key={pending ? `${pending.id}-${pending.status}` : 'none'}
              projectId={project.id}
              hasCover={project.cover !== null}
              pending={pending}
            />
          </div>
        </div>
      </div>
      {typeRow}
    </div>
  );
}

/** The fields, then the release type (still live), then deleting, last and set apart. */
function EditForm({
  project,
  trackCount,
  typeRow,
  onDone,
}: {
  project: ProjectDetailResponse;
  trackCount: number;
  typeRow: ReactNode;
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

      {typeRow}

      {project.cover && <RemoveCover projectId={project.id} cover={project.cover} />}

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

/** Takes the cover art off, leaving the placeholder. Another one can be added any time. */
function RemoveCover({ projectId, cover }: { projectId: string; cover: CoverImage }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="cover-heading" className="border-t border-rule pt-5">
      <h2 id="cover-heading" className="text-base font-semibold">
        Cover art
      </h2>
      <div className="mt-2 flex items-center gap-3">
        <ProjectCover cover={cover} size="list" />
        <p className="max-w-[65ch] text-sm text-muted">
          Takes the cover art off this project. You can add another any time.
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn mt-3"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await removeCoverAction(projectId);
            if (!result.ok) setError(result.message);
          })
        }
      >
        {pending ? 'Removing…' : 'Remove cover art'}
      </button>
    </section>
  );
}
