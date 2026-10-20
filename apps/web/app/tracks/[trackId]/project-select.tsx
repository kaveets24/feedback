'use client';

import { useActionState } from 'react';
import { DownIcon } from '../../_shell/icons';
import { setTrackProjectAction } from '../../projects/actions';

/** Moves the track into a project, between projects, or out of one. */
export function ProjectSelect({
  trackId,
  projectId,
  projects,
}: {
  trackId: string;
  projectId: string | null;
  projects: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(setTrackProjectAction, null);

  return (
    <form action={action}>
      <input type="hidden" name="trackId" value={trackId} />
      <input type="hidden" name="fromProjectId" value={projectId ?? ''} />
      <label htmlFor="track-project" className="mb-1 block text-sm font-medium">
        Project
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          {/* Keyed so it shows the saved project again after each move. */}
          <select
            key={projectId ?? 'none'}
            id="track-project"
            name="projectId"
            defaultValue={projectId ?? ''}
            className="field appearance-none pr-10"
          >
            <option value="">Not in a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
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
      </div>
      {state && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
