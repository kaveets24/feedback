'use client';

import { useActionState } from 'react';
import { setTrackProjectAction } from '../../projects/actions';

/** Moves the track into a project, between projects, or out of one. Plain HTML, like this page. */
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
      <label>
        Project {/* Keyed so it shows the saved project again after each move. */}
        <select key={projectId ?? 'none'} name="projectId" defaultValue={projectId ?? ''}>
          <option value="">Not in a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
      </label>{' '}
      <button type="submit" disabled={pending}>
        {pending ? 'Moving…' : 'Move'}
      </button>
      {state && <p role="alert">{state.message}</p>}
    </form>
  );
}
