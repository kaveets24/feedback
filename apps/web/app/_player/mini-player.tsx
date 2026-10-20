'use client';

import Link from 'next/link';
import { LcdTime } from './lcd-time';
import { audioStore, useAudio } from './store';
import { TransportButton } from './transport-button';
import { Waveform } from './waveform';

/**
 * The player bar at the bottom of every page once something has played, so listening carries on
 * across navigation. Sticks to the bottom of the viewport; the root layout keeps it there.
 */
export function MiniPlayer() {
  const item = useAudio((s) => s.item);
  const status = useAudio((s) => s.status);
  const positionMs = useAudio((s) => s.positionMs);
  const error = useAudio((s) => s.error);
  if (!item) return null;

  const toggle = () => void audioStore.toggle();

  return (
    <aside
      aria-label="Now playing"
      className="sticky bottom-0 z-10 border-t border-chrome-edge bg-chrome-lo shadow-panel selection:bg-accent selection:text-canvas"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <TransportButton status={status} title={item.title} size="md" onClick={toggle} />
        <div className="min-w-0 flex-1 sm:w-72 sm:flex-none">
          <Link
            // Someone listening by a share link goes back to it, not to the owner's track page.
            href={item.shareToken ? `/listen#${item.shareToken}` : `/tracks/${item.trackId}`}
            className="focus-glow block truncate rounded-sm text-sm font-medium text-ink hover:text-accent"
          >
            {item.title}
          </Link>
          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : (
            <p className="font-lcd text-xs text-lcd-ink">
              <LcdTime ms={positionMs} />
              <span className="text-lcd-cyan">
                {' '}
                / <LcdTime ms={item.durationMs} /> · v{item.versionNumber}
              </span>
            </p>
          )}
        </div>
        <Waveform
          className="h-7 basis-full sm:h-9 sm:flex-1 sm:basis-auto"
          peaks={item.peaks}
          durationMs={item.durationMs}
          positionMs={positionMs}
          label={`Seek in ${item.title} v${item.versionNumber}`}
          onSeek={audioStore.seek}
          onToggle={toggle}
        />
      </div>
    </aside>
  );
}
