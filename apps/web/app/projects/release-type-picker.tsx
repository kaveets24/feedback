'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { RELEASE_TYPES, type ReleaseType } from '@feedback/shared';
import { RELEASE_TYPE_LABELS } from '../../lib/format';
import { setReleaseTypeAction } from './actions';

/**
 * What kind of release the project is, as a row of LCD segments: the chosen one is solid, the
 * others unlit but readable. It's a radio group, so arrow keys move along it, and each choice
 * saves at once.
 */
export function ReleaseTypePicker({
  projectId,
  releaseType,
}: {
  projectId: string;
  releaseType: ReleaseType;
}) {
  const [shown, setShown] = useOptimistic(releaseType);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(next: ReleaseType) {
    setError(null);
    startTransition(async () => {
      setShown(next);
      const result = await setReleaseTypeAction(projectId, next);
      // The picker falls back to the saved type on its own; say so.
      if (!result.ok) {
        setError(
          `Couldn't change the release type, so it's still ${RELEASE_TYPE_LABELS[releaseType]}. Reload the page and try again.`,
        );
      }
    });
  }

  // A fragment, so the error wraps onto its own line in the surrounding row.
  return (
    <>
      <fieldset>
        <legend className="sr-only">Release type</legend>
        <div className="lcd m-[3px] inline-flex gap-1 p-1">
          {RELEASE_TYPES.map((value) => (
            <label
              key={value}
              className={`relative cursor-pointer rounded-[2px] px-3 py-1.5 font-lcd text-xs uppercase sm:px-4 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent ${
                value === shown ? 'bg-lcd-ink text-lcd' : 'text-lcd-unlit hover:text-accent'
              }`}
            >
              <input
                type="radio"
                name="releaseType"
                value={value}
                checked={value === shown}
                onChange={() => choose(value)}
                className="sr-only"
              />
              {RELEASE_TYPE_LABELS[value]}
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
