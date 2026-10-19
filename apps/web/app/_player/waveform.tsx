'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatDuration } from '../../lib/format';
import {
  positionAt,
  positionForKey,
  SEGMENT_GAP_PX,
  SEGMENT_PX,
  waveformGeometry,
} from '../../lib/waveform';

/** Drawn at this size until the real one is measured (server render, first paint). */
const FALLBACK_SIZE = { width: 600, height: 96 };

/**
 * A version's waveform in an LCD window, and a slider for seeking through it. Click or drag to
 * seek (dragging previews and seeks on release); arrow keys step 5 seconds, Page Up/Down 30,
 * Home/End jump to the ends, Space plays or pauses.
 */
export function Waveform({
  peaks,
  durationMs,
  positionMs,
  label,
  onSeek,
  onToggle,
  className = '',
}: {
  peaks: readonly number[];
  durationMs: number;
  positionMs: number;
  /** Names the slider, e.g. "Seek in Night drive v2". */
  label: string;
  onSeek: (ms: number) => void;
  onToggle: () => void;
  /** Sizes the window (height and width come from layout). */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(FALLBACK_SIZE);
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const id = useId();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(
    () => waveformGeometry(peaks, size.width, size.height),
    [peaks, size.width, size.height],
  );

  const shownMs = scrubMs ?? positionMs;
  const progressX = durationMs > 0 ? (Math.min(shownMs, durationMs) / durationMs) * size.width : 0;
  const pointerMs = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return positionAt(clientX - rect.left, rect.width, durationMs);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === ' ') {
      event.preventDefault();
      onToggle();
      return;
    }
    const to = positionForKey(event.key, positionMs, durationMs);
    if (to === null) return;
    event.preventDefault();
    onSeek(to);
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(durationMs / 1000)}
      aria-valuenow={Math.round(shownMs / 1000)}
      aria-valuetext={`${formatDuration(shownMs)} of ${formatDuration(durationMs)}`}
      className={`lcd focus-glow relative cursor-pointer touch-none overflow-hidden select-none ${className}`}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setScrubMs(pointerMs(event.clientX));
      }}
      onPointerMove={(event) => {
        if (scrubMs !== null) setScrubMs(pointerMs(event.clientX));
      }}
      onPointerUp={(event) => {
        if (scrubMs === null) return;
        setScrubMs(null);
        onSeek(pointerMs(event.clientX));
      }}
      onPointerCancel={() => setScrubMs(null)}
    >
      <svg
        className="absolute inset-0 size-full"
        viewBox={`0 0 ${size.width} ${size.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          {/* Horizontal gaps that split each bar into LCD segments. */}
          <pattern
            id={`${id}-rows`}
            patternUnits="userSpaceOnUse"
            x={0}
            y={geometry.stripeY}
            width={size.width}
            height={SEGMENT_PX}
          >
            <rect width={size.width} height={SEGMENT_PX - SEGMENT_GAP_PX} fill="white" />
          </pattern>
          <mask id={`${id}-segments`}>
            <rect width={size.width} height={size.height} fill={`url(#${id}-rows)`} />
          </mask>
          <clipPath id={`${id}-played`}>
            <rect width={progressX} height={size.height} />
          </clipPath>
          <clipPath id={`${id}-unplayed`}>
            <rect x={progressX} width={Math.max(0, size.width - progressX)} height={size.height} />
          </clipPath>
        </defs>
        <g mask={`url(#${id}-segments)`}>
          <path d={geometry.cells} className="fill-lcd-cell" />
          <path d={geometry.bars} className="fill-lcd-dim" clipPath={`url(#${id}-unplayed)`} />
          <path d={geometry.bars} className="fill-lcd-ink" clipPath={`url(#${id}-played)`} />
        </g>
        {shownMs > 0 && (
          <rect
            x={Math.max(0, progressX - 1)}
            width={2}
            height={size.height}
            className="fill-lcd-cyan"
          />
        )}
      </svg>
    </div>
  );
}
