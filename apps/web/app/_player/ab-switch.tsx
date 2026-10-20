'use client';

import { formatDuration } from '../../lib/format';
import type { PlayerItem } from '../../lib/audio-store';
import { DownIcon } from '../_shell/icons';

export type Side = 'a' | 'b';

/**
 * A/B between two versions, as a two-segment LCD switch: the one in the player is solid. It's a
 * radio group, so arrow keys flip it (as do the A and B keys anywhere in the player). With more
 * than one older version, a picker sets which one is B.
 */
export function AbSwitch({
  a,
  b,
  older,
  side,
  onChoose,
  onCompare,
}: {
  a: PlayerItem;
  b: PlayerItem;
  /** Every version B could be, newest first. */
  older: readonly PlayerItem[];
  side: Side;
  onChoose: (side: Side) => void;
  onCompare: (versionId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <fieldset>
        <legend className="sr-only">Compare versions</legend>
        <div className="lcd m-[3px] inline-flex gap-1 p-1">
          {(['a', 'b'] as const).map((value) => {
            const version = value === 'a' ? a : b;
            return (
              <label
                key={value}
                className={`relative cursor-pointer rounded-[2px] px-3 py-1.5 font-lcd text-xs uppercase sm:px-4 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent ${
                  value === side ? 'bg-lcd-ink text-lcd' : 'text-lcd-unlit hover:text-accent'
                }`}
              >
                <input
                  type="radio"
                  name={`ab-${a.trackId}`}
                  value={value}
                  checked={value === side}
                  onChange={() => onChoose(value)}
                  aria-keyshortcuts={value.toUpperCase()}
                  className="sr-only"
                />
                {value} · v{version.versionNumber}
              </label>
            );
          })}
        </div>
      </fieldset>
      {older.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor={`compare-${a.trackId}`} className="text-sm text-muted">
            Compare with
          </label>
          <div className="relative">
            <select
              id={`compare-${a.trackId}`}
              value={b.versionId}
              onChange={(event) => onCompare(event.target.value)}
              className="field min-h-9 appearance-none py-1 pr-9 text-sm"
            >
              {older.map((version) => (
                <option key={version.versionId} value={version.versionId}>
                  v{version.versionNumber} · {formatDuration(version.durationMs)}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-muted">
              <DownIcon />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
