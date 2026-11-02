'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { DownIcon } from '../../_shell/icons';
import { setTrackProjectAction } from '../../projects/actions';

/**
 * The track's project, as a link with a Change button. Change opens a select with Move and Cancel
 * that moves the track into a project, between projects, or out of one. Escape cancels (unless a
 * move is under way), and focus goes back to Change afterwards.
 */
export function ProjectSelect({
  trackId,
  projectId,
  projects,
}: {
  trackId: string;
  projectId: string | null;
  projects: { id: string; title: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      changeRef.current?.focus();
    }
  }, [editing]);

  function close() {
    returnFocus.current = true;
    setError(null);
    setEditing(false);
  }

  function move(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await setTrackProjectAction(null, form);
      if (result) setError(result.message);
      else close();
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="text-muted">Project</span>
        {project ? (
          <Link href={`/projects/${project.id}`} className="link">
            {project.title}
          </Link>
        ) : (
          <span>Not in a project</span>
        )}
        <button
          ref={changeRef}
          type="button"
          className="btn btn-ghost"
          aria-label="Change project"
          onClick={() => setEditing(true)}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <form
      action={move}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !pending) close();
      }}
    >
      <input type="hidden" name="trackId" value={trackId} />
      <input type="hidden" name="fromProjectId" value={projectId ?? ''} />
      <label htmlFor="track-project" className="mb-1 block text-sm font-medium">
        Project
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <select
            id="track-project"
            name="projectId"
            defaultValue={projectId ?? ''}
            autoFocus
            className="field appearance-none pr-10"
          >
            <option value="">Not in a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
            <DownIcon />
          </span>
        </div>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Moving…' : 'Move'}
        </button>
        <button type="button" className="btn" onClick={close} disabled={pending}>
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
