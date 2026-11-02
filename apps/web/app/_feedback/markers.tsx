/** A pinned comment as a mark on the waveform. */
export type FeedbackMarker = { id: string; timestampMs: number; resolved: boolean };

/**
 * A rail under the waveform with a tick at each pinned comment: open ones in `accent`, resolved
 * ones in `field-edge`. Clicking one shows that comment. It's a pointer shortcut only, hidden from
 * screen readers and out of the tab order: the comment list, with its moments, is the keyboard
 * and screen-reader path to the same place.
 */
export function MarkerRail({
  markers,
  durationMs,
  onSelect,
}: {
  markers: readonly FeedbackMarker[];
  durationMs: number;
  onSelect: (id: string) => void;
}) {
  if (markers.length === 0 || durationMs <= 0) return null;
  return (
    <div aria-hidden="true" className="relative mt-1 h-6">
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          tabIndex={-1}
          onClick={() => onSelect(marker.id)}
          style={{ left: `${(Math.min(marker.timestampMs, durationMs) / durationMs) * 100}%` }}
          className="group absolute top-0 -ml-3 flex size-6 cursor-pointer items-center justify-center"
        >
          <span
            className={`h-3 w-1 rounded-[1px] group-hover:bg-accent ${
              marker.resolved ? 'bg-field-edge' : 'bg-accent'
            }`}
          />
        </button>
      ))}
    </div>
  );
}
