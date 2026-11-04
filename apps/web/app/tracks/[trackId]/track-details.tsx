'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { GENRE_LABELS, GENRE_OPTIONS, type Genre } from '@feedback/shared';
import { saveTrackDetails } from '../../../lib/track-details';
import { audioStore } from '../../_player/store';
import { DownIcon, EditIcon } from '../../_shell/icons';
import { setTrackProjectAction } from '../../projects/actions';
import { updateTrackDetailsAction } from './actions';

/**
 * The track's title as the page heading, with its project and genre under it. One pencil button
 * makes all three editable, with one Save. Escape cancels (unless a save is under way), and focus
 * goes back to the pencil afterwards.
 */
export function TrackDetails({
  trackId,
  title,
  projectId,
  genre,
  projects,
}: {
  trackId: string;
  title: string;
  projectId: string | null;
  genre: Genre | null;
  projects: { id: string; title: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const project = projects.find((p) => p.id === projectId);

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

  // A submit handler, not a form action: React resets a form after its action runs, which would
  // throw away what was typed when a save fails.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const failure = await saveTrackDetails(
        { title, genre, projectId },
        {
          title: String(form.get('title')).trim(),
          genre: String(form.get('genre')) || null,
          projectId: String(form.get('projectId')) || null,
        },
        {
          saveDetails: async (changes) => {
            const saved = await updateTrackDetailsAction(trackId, changes);
            if (saved.ok) audioStore.retitle(trackId, saved.data.title);
            return saved;
          },
          moveToProject: () => setTrackProjectAction(null, form),
        },
      );
      if (failure) setError(failure);
      else close();
    });
  }

  if (!editing) {
    return (
      <>
        <div className="flex items-start gap-2">
          {/* The margin centres the first line on the button, which stays beside a long title. */}
          <h1 className="mt-0.5 min-w-0 text-3xl font-semibold break-words text-balance">
            {title}
          </h1>
          <button
            ref={editRef}
            type="button"
            className="btn btn-ghost btn-icon shrink-0"
            aria-label="Edit track details"
            title="Edit track details"
            onClick={() => setEditing(true)}
          >
            <EditIcon />
          </button>
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">Project</dt>
          <dd className="min-w-0 break-words">
            {project ? (
              <Link href={`/projects/${project.id}`} className="link">
                {project.title}
              </Link>
            ) : (
              'None'
            )}
          </dd>
          <dt className="text-muted">Genre</dt>
          <dd>{genre ? GENRE_LABELS[genre] : 'None'}</dd>
        </dl>
      </>
    );
  }

  return (
    <>
      {/* The page keeps its heading for screen readers while the visible one is being edited. */}
      <h1 className="sr-only">{title}</h1>
      <form
        onSubmit={onSubmit}
        aria-label="Edit track details"
        className="max-w-xl space-y-4"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !pending) close();
        }}
      >
        <input type="hidden" name="trackId" value={trackId} />
        <input type="hidden" name="fromProjectId" value={projectId ?? ''} />
        <div>
          <label htmlFor="track-title" className="mb-1 block text-sm font-medium">
            Title
          </label>
          <input
            id="track-title"
            type="text"
            name="title"
            required
            maxLength={200}
            defaultValue={title}
            autoFocus
            className="field"
          />
        </div>
        <Select id="track-project" name="projectId" label="Project" defaultValue={projectId ?? ''}>
          <option value="">None</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <Select id="track-genre" name="genre" label="Genre" defaultValue={genre ?? ''}>
          <option value="">None</option>
          {GENRE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {GENRE_LABELS[option]}
            </option>
          ))}
        </Select>
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
    </>
  );
}

function Select({
  id,
  name,
  label,
  defaultValue,
  children,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={name}
          defaultValue={defaultValue}
          className="field appearance-none pr-10"
        >
          {children}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
          <DownIcon />
        </span>
      </div>
    </div>
  );
}
