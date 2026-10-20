import type { ReleaseType } from '@feedback/shared';
import { RELEASE_TYPE_LABELS } from '../../lib/format';

/** A project's release type at list size: the word in a small LCD window. */
export function ReleaseTypeBadge({ releaseType }: { releaseType: ReleaseType }) {
  return (
    <span className="lcd mr-[3px] inline-flex w-[7.5rem] shrink-0 items-center justify-center px-2 py-1">
      <span className="font-lcd text-xs uppercase text-lcd-ink">
        <span className="sr-only">Release type: </span>
        {RELEASE_TYPE_LABELS[releaseType]}
      </span>
    </span>
  );
}
