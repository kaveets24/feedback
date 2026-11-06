'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { queueIndex, type PlayerItem } from '../../lib/audio-store';
import { sharedTrackFragment } from '../../lib/share';
import { LcdTime } from './lcd-time';
import { audioStore, useAudio } from './store';
import { SkipButton, TransportButton } from './transport-button';
import { VolumeControl } from './volume-control';
import { Waveform } from './waveform';

/**
 * The player bar at the bottom of every page once something has played, so listening carries on
 * across navigation. It's the bottom row of the root layout's grid, under the scrolling page.
 */
export function MiniPlayer() {
  const item = useAudio((s) => s.item);
  const status = useAudio((s) => s.status);
  const positionMs = useAudio((s) => s.positionMs);
  const error = useAudio((s) => s.error);
  const index = useAudio(queueIndex);
  const queued = useAudio((s) => s.queue.length);
  if (!item) return null;

  const toggle = () => void audioStore.toggle();
  const inQueue = index >= 0 && queued > 1;

  return (
    <aside
      aria-label="Now playing"
      className="relative z-10 border-t border-chrome-edge bg-chrome-lo shadow-panel selection:bg-accent selection:text-canvas"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <div className="flex items-center gap-1">
          {inQueue && (
            <SkipButton direction="previous" onClick={() => void audioStore.previous()} />
          )}
          <TransportButton status={status} title={item.title} size="md" onClick={toggle} />
          {inQueue && (
            <SkipButton
              direction="next"
              disabled={index === queued - 1}
              onClick={() => void audioStore.next()}
            />
          )}
        </div>
        {/* Narrower with a queue below `md`, so the skip buttons don't squeeze out the waveform. */}
        <div className={`min-w-0 flex-1 sm:flex-none ${inQueue ? 'sm:w-44 md:w-72' : 'sm:w-72'}`}>
          <TitleLink item={item} />
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
                {inQueue && (
                  <span className="hidden md:inline">
                    {' '}
                    · {index + 1}/{queued}
                  </span>
                )}
              </span>
            </p>
          )}
        </div>
        {/* On phones it takes the full width, so it goes last to keep Mute on the first row. */}
        <Waveform
          className="h-7 basis-full max-sm:order-last sm:h-9 sm:flex-1 sm:basis-auto"
          peaks={item.peaks}
          durationMs={item.durationMs}
          positionMs={positionMs}
          label={`Seek in ${item.title} v${item.versionNumber}`}
          onSeek={audioStore.seek}
          onToggle={toggle}
        />
        <VolumeControl size="mini" />
      </div>
    </aside>
  );
}

const TITLE_LINK_CLASS =
  'focus-glow block truncate rounded-sm text-sm font-medium text-ink hover:text-accent';

/**
 * The title, going to the track. Someone listening by a share link goes back through it, not to the
 * owner's track page. Already on the listen page that takes a plain link: only a real fragment
 * change tells the page, and from anywhere else a plain link would reload the app and stop the
 * audio.
 */
function TitleLink({ item }: { item: PlayerItem }) {
  const pathname = usePathname();
  if (!item.shareToken) {
    return (
      <Link href={`/tracks/${item.trackId}`} className={TITLE_LINK_CLASS}>
        {item.title}
      </Link>
    );
  }
  const fragment = sharedTrackFragment(item.shareToken, item.trackId);
  return pathname === '/listen' ? (
    <a
      href={fragment}
      className={TITLE_LINK_CLASS}
      onClick={() => document.querySelector('main')?.scrollIntoView()}
    >
      {item.title}
    </a>
  ) : (
    <Link href={`/listen${fragment}`} className={TITLE_LINK_CLASS}>
      {item.title}
    </Link>
  );
}
