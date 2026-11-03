'use client';

import { commentAt, type FeedbackMarker } from '../../lib/comment-at';
import { LcdTime } from '../_player/lcd-time';

export type { FeedbackMarker };

/**
 * A rail under the waveform with a tick at each pinned comment: open ones in `accent`, resolved
 * ones in `field-edge`, and the one the comment line is showing glowing. Pointing at a tick
 * previews it in the comment line; clicking shows the thread. It's a pointer shortcut only,
 * hidden from screen readers and out of the tab order: the comment line and the comment list,
 * with its moments, are the keyboard and screen-reader path to the same place.
 */
export function MarkerRail({
  markers,
  durationMs,
  activeId,
  onSelect,
  onHover,
}: {
  markers: readonly FeedbackMarker[];
  durationMs: number;
  activeId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  if (markers.length === 0 || durationMs <= 0) return null;
  return (
    <div aria-hidden="true" className="relative mt-1 h-6" onPointerLeave={() => onHover(null)}>
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          tabIndex={-1}
          onClick={() => onSelect(marker.id)}
          onPointerEnter={() => onHover(marker.id)}
          style={{ left: `${(Math.min(marker.timestampMs, durationMs) / durationMs) * 100}%` }}
          className="group absolute top-0 -ml-3 flex size-6 cursor-pointer items-center justify-center"
        >
          <span
            className={`h-3 w-1 rounded-[1px] group-hover:bg-accent ${
              marker.resolved ? 'bg-field-edge' : 'bg-accent'
            } ${marker.id === activeId ? 'shadow-focus-glow' : ''}`}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * A one-line LCD readout under the marker rail: the comment at the playhead (or the tick being
 * pointed at), so you can read along without scrolling. The moment in cyan, the author in
 * phosphor, the words in sans on the LCD (cut to one line), and where it falls in the list. A
 * button: pressing it shows the whole thread below, like clicking its tick.
 */
export function CommentLine({
  markers,
  positionMs,
  hoveredId,
  onSelect,
}: {
  markers: readonly FeedbackMarker[];
  positionMs: number;
  hoveredId: string | null;
  onSelect: (id: string) => void;
}) {
  const shown = commentAt(markers, positionMs, hoveredId);
  if (!shown) return null;
  const { marker, index, upcoming } = shown;
  return (
    <button
      type="button"
      onClick={() => onSelect(marker.id)}
      className="group lcd mx-[3px] mt-2 flex w-[calc(100%-6px)] min-w-0 cursor-pointer items-baseline gap-3 px-3 py-2 text-left text-sm"
    >
      {upcoming && <span className="shrink-0 font-lcd text-xs text-lcd-unlit uppercase">Next</span>}
      <LcdTime ms={marker.timestampMs} className="shrink-0 font-lcd text-lcd-cyan" />
      <span className="max-w-[40%] shrink-0 truncate font-medium text-lcd-ink">
        {marker.author}
      </span>
      <span
        className={`min-w-0 flex-1 truncate group-hover:text-accent ${marker.resolved ? 'text-muted' : 'text-ink'}`}
      >
        {marker.body}
      </span>
      <span className="shrink-0 font-lcd text-xs text-lcd-unlit tabular-nums">
        <span className="sr-only">Comment </span>
        {index + 1}/{markers.length}
      </span>
    </button>
  );
}
