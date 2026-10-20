'use client';

import { useActionState } from 'react';
import { createProjectAction } from './actions';

/** Names a new project and opens it. */
export function NewProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, null);

  return (
    <form action={action}>
      <label htmlFor="new-project" className="mb-1 block text-sm font-medium">
        New project
      </label>
      <div className="flex gap-2">
        <input
          id="new-project"
          name="title"
          required
          maxLength={200}
          placeholder="e.g. Night Drive EP"
          className="field min-w-0"
        />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Creating…' : 'Create'}
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
