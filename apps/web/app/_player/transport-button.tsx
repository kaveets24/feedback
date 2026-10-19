'use client';

import type { PlaybackStatus } from '../../lib/audio-store';

const SIZES = {
  lg: { button: 'size-14', icon: 22 },
  md: { button: 'size-11', icon: 18 },
} as const;

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
      <svg
        width={SIZES[size].icon}
        height={SIZES[size].icon}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        {active ? (
          <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
        ) : (
          <path d="M7 3.5v17a.5.5 0 0 0 .77.42l13-8.5a.5.5 0 0 0 0-.84l-13-8.5A.5.5 0 0 0 7 3.5z" />
        )}
      </svg>
    </button>
  );
}
