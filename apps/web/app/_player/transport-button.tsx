'use client';

import type { PlaybackStatus } from '../../lib/audio-store';

const SIZES = {
  lg: { button: 'size-14', icon: 22 },
  md: { button: 'size-11', icon: 18 },
} as const;

/** The play or pause symbol, also used on the project page's Play button. */
export function PlayPauseIcon({ active, size }: { active: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {active ? (
        <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
      ) : (
        <path d="M7 3.5v17a.5.5 0 0 0 .77.42l13-8.5a.5.5 0 0 0 0-.84l-13-8.5A.5.5 0 0 0 7 3.5z" />
      )}
    </svg>
  );
}

/** Previous or next in the queue: a size down from play, so the transport reads as one group. */
export function SkipButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'previous' | 'next';
  disabled?: boolean;
  onClick: () => void;
}) {
  const label = direction === 'next' ? 'Next track' : 'Previous track';
  return (
    <button
      type="button"
      className="bevel-button size-10"
      aria-label={label}
      title={label}
      // Not `disabled`: pressing Next onto the last track would drop the focus it has.
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {direction === 'next' ? (
          <path d="M4 4l12 8-12 8zM17 4h3v16h-3z" />
        ) : (
          <path d="M20 4L8 12l12 8zM4 4h3v16H4z" />
        )}
      </svg>
    </button>
  );
}

/** Play/pause for one version. Shows pause while loading, since playback is on its way. */
export function TransportButton({
  status,
  title,
  size,
  onClick,
}: {
  status: PlaybackStatus;
  /** What it plays, for its label, e.g. "Play Night drive". */
  title: string;
  size: keyof typeof SIZES;
  onClick: () => void;
}) {
  const active = status === 'playing' || status === 'loading';
  return (
    <button
      type="button"
      className={`bevel-button ${SIZES[size].button} ${active ? 'text-accent' : ''}`}
      aria-label={`${active ? 'Pause' : 'Play'} ${title}`}
      aria-busy={status === 'loading'}
      onClick={onClick}
    >
      <PlayPauseIcon active={active} size={SIZES[size].icon} />
    </button>
  );
}
