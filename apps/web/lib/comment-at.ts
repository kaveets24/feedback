/** A pinned comment as a mark on the waveform, with enough of it to preview. */
export type FeedbackMarker = {
  id: string;
  timestampMs: number;
  resolved: boolean;
  /** How the author signs it: their name, their @handle, or "Someone". */
  author: string;
  body: string;
};

/**
 * Which pinned comment the comment line shows: the tick being pointed at, else the last one the
 * playhead has passed, else the first one ahead (as "next"). Markers come in timeline order.
 */
export function commentAt(
  markers: readonly FeedbackMarker[],
  positionMs: number,
  hoveredId: string | null,
): { marker: FeedbackMarker; index: number; upcoming: boolean } | null {
  const hovered = markers.findIndex((m) => m.id === hoveredId);
  if (hovered >= 0) return { marker: markers[hovered]!, index: hovered, upcoming: false };
  let passed = -1;
  markers.forEach((m, i) => {
    if (m.timestampMs <= positionMs) passed = i;
  });
  if (passed >= 0) return { marker: markers[passed]!, index: passed, upcoming: false };
  const first = markers[0];
  return first ? { marker: first, index: 0, upcoming: true } : null;
}
