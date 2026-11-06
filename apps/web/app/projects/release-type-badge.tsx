import type { ReleaseType } from '@feedback/shared';
import { RELEASE_TYPE_LABELS } from '../../lib/format';

/**
 * A project's release type: the word in a small LCD window. Fixed-width by default, so badges line
 * up down a list; `fit` sizes it to the word, for one on its own.
 */
export function ReleaseTypeBadge({
  releaseType,
  fit = false,
}: {
  releaseType: ReleaseType;
  fit?: boolean;
}) {
  return (
    <span
      className={`lcd mr-[3px] inline-flex shrink-0 items-center justify-center py-1 ${fit ? 'px-3' : 'w-[7.5rem] px-2'}`}
    >
      <span className="font-lcd text-xs uppercase text-lcd-ink">
        <span className="sr-only">Release type: </span>
        {RELEASE_TYPE_LABELS[releaseType]}
      </span>
    </span>
  );
}
