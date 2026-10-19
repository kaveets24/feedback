/**
 * Geometry for the LCD waveform (see the player's surface brief): mirrored bars made of
 * segments, sized in CSS pixels so they stay crisp at any width.
 */

/** Each bar takes this much width, gap included. */
export const BAR_SLOT_PX = 6;
export const BAR_GAP_PX = 2;
/** Each segment takes this much height, gap included. */
export const SEGMENT_PX = 4;
export const SEGMENT_GAP_PX = 1;
/**
 * Peaks are absolute (a quiet demo is quiet), so scale them up to fill the window, but by no
 * more than this, so near-silence still draws as near-silence.
 */
export const MAX_DISPLAY_GAIN = 4;

/** The loudest peak in each of `count` equal slices. */
export function bucketPeaks(peaks: readonly number[], count: number): number[] {
  if (peaks.length === 0) return new Array<number>(count).fill(0);
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor((i * peaks.length) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / count));
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j++) max = Math.max(max, peaks[j]!);
    return max;
  });
}

export function displayGain(peaks: readonly number[]): number {
  const max = Math.max(0, ...peaks);
  return max === 0 ? 1 : Math.min(1 / max, MAX_DISPLAY_GAIN);
}

export type WaveformGeometry = {
  /** SVG path for the bars at their levels. */
  bars: string;
  /** SVG path for every segment of every bar: the LCD's unlit cells. */
  cells: string;
  /** Where the segment stripe pattern starts, so a gap runs along the center line. */
  stripeY: number;
};

/** The waveform for `peaks` drawn into a `width` by `height` box. */
export function waveformGeometry(
  peaks: readonly number[],
  width: number,
  height: number,
): WaveformGeometry {
  const count = Math.max(1, Math.floor((width + BAR_GAP_PX) / BAR_SLOT_PX));
  const rows = Math.max(1, Math.floor(height / 2 / SEGMENT_PX));
  const center = height / 2;
  const left = (width - (count * BAR_SLOT_PX - BAR_GAP_PX)) / 2;
  const barWidth = BAR_SLOT_PX - BAR_GAP_PX;
  const gain = displayGain(peaks);

  const rect = (i: number, level: number) => {
    const x = left + i * BAR_SLOT_PX;
    const y = center + SEGMENT_GAP_PX / 2 - level * SEGMENT_PX;
    return `M${x} ${y}h${barWidth}v${2 * level * SEGMENT_PX - SEGMENT_GAP_PX}h-${barWidth}z`;
  };

  const levels = bucketPeaks(peaks, count).map((peak) =>
    // At least one segment, so silence still shows as a lit baseline.
    Math.min(rows, Math.max(1, Math.ceil(peak * gain * rows))),
  );
  return {
    bars: levels.map((level, i) => rect(i, level)).join(''),
    cells: levels.map((_, i) => rect(i, rows)).join(''),
    stripeY: center + SEGMENT_GAP_PX / 2,
  };
}

/** The position under `x` pixels from the left of a `width`-wide waveform. */
export function positionAt(x: number, width: number, durationMs: number): number {
  if (width <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, x / width)) * durationMs);
}

/** Arrow keys step this far, Page Up/Down further. */
export const SEEK_STEP_MS = 5_000;
export const SEEK_PAGE_MS = 30_000;

/** Where a key pressed on the waveform slider moves playback to, or null for other keys. */
export function positionForKey(key: string, positionMs: number, durationMs: number): number | null {
  const to = (ms: number) => Math.min(durationMs, Math.max(0, ms));
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return to(positionMs - SEEK_STEP_MS);
    case 'ArrowRight':
    case 'ArrowUp':
      return to(positionMs + SEEK_STEP_MS);
    case 'PageDown':
      return to(positionMs - SEEK_PAGE_MS);
    case 'PageUp':
      return to(positionMs + SEEK_PAGE_MS);
    case 'Home':
      return 0;
    case 'End':
      return durationMs;
    default:
      return null;
  }
}
