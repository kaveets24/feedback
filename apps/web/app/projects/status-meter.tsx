'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { PROJECT_STATUSES, type ProjectStatus } from '@feedback/shared';
import { PROJECT_STATUS_LABELS } from '../../lib/format';
import { setProjectStatusAction } from './actions';

/**
 * Where the project stands, as an LCD segment meter: stages already passed are lit, the current
 * one is solid, and the ones ahead are unlit. It's a radio group, so arrow keys move along it, and
 * each choice saves at once.
 */
export function StatusMeter({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const [shown, setShown] = useOptimistic(status);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current = PROJECT_STATUSES.indexOf(shown);

  function choose(next: ProjectStatus) {
    setError(null);
    startTransition(async () => {
      setShown(next);
      const result = await setProjectStatusAction(projectId, next);
      // The meter falls back to the saved stage on its own; say so.
      if (!result.ok) {
        setError(
          `Couldn't change the status, so it's still ${PROJECT_STATUS_LABELS[status]}. Reload the page and try again.`,
        );
      }
    });
  }

  // A fragment, so the error wraps onto its own line in the surrounding row.
  return (
    <>
      <fieldset>
        <legend className="sr-only">Status</legend>
        <div className="lcd m-[3px] inline-flex gap-1 p-1">
          {PROJECT_STATUSES.map((value, index) => (
            <label
              key={value}
              className={`relative cursor-pointer rounded-[2px] px-3 py-1.5 font-lcd text-xs uppercase sm:px-4 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent ${
                index === current
                  ? 'bg-lcd-ink text-lcd'
                  : `${index < current ? 'text-lcd-ink' : 'text-lcd-unlit'} hover:text-accent`
              }`}
            >
              <input
                type="radio"
                name="status"
                value={value}
                checked={index === current}
                onChange={() => choose(value)}
                className="sr-only"
              />
              {PROJECT_STATUS_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="order-last basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
