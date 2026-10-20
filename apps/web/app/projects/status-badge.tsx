import { PROJECT_STATUSES, type ProjectStatus } from '@feedback/shared';
import { PROJECT_STATUS_LABELS } from '../../lib/format';

/** A project's status at list size: lit pips up to the current stage, then its name. */
export function StatusBadge({ status }: { status: ProjectStatus }) {
  const current = PROJECT_STATUSES.indexOf(status);
  return (
    <span className="lcd mr-[3px] inline-flex w-[7.5rem] shrink-0 items-center justify-between gap-2 px-2 py-1">
      <span aria-hidden="true" className="flex gap-0.5">
        {PROJECT_STATUSES.map((value, index) => (
          <span
            key={value}
            className={`h-2.5 w-1.5 ${index <= current ? 'bg-lcd-ink' : 'bg-lcd-cell'}`}
          />
        ))}
      </span>
      <span className="font-lcd text-xs uppercase text-lcd-ink">
        <span className="sr-only">Status: </span>
        {PROJECT_STATUS_LABELS[status]}
      </span>
    </span>
  );
}
