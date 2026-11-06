import type { ComponentProps } from 'react';
import { DownIcon } from './icons';

/** A labelled native select with the system's chevron. Takes any select prop. */
export function SelectField({
  id,
  label,
  children,
  ...select
}: { id: string; label: string } & ComponentProps<'select'>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <select id={id} {...select} className="field appearance-none pr-10">
          {children}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
          <DownIcon />
        </span>
      </div>
    </div>
  );
}
