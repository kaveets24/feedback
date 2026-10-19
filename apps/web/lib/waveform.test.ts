import { describe, expect, it } from 'vitest';
import {
  bucketPeaks,
  displayGain,
  MAX_DISPLAY_GAIN,
  positionAt,
  positionForKey,
  waveformGeometry,
} from './waveform';

describe('bucketPeaks', () => {
  it('keeps the loudest peak of each slice', () => {
    expect(bucketPeaks([0.1, 0.9, 0.2, 0.3, 0.8, 0.4], 3)).toEqual([0.9, 0.3, 0.8]);
  });

  it('repeats peaks when there are more buckets than peaks', () => {
    expect(bucketPeaks([0.2, 0.6], 4)).toEqual([0.2, 0.2, 0.6, 0.6]);
  });

  it('draws silence for no peaks', () => {
    expect(bucketPeaks([], 2)).toEqual([0, 0]);
  });
});

describe('displayGain', () => {
  it('scales the loudest peak up to full height', () => {
    expect(displayGain([0.25, 0.5])).toBe(2);
  });

  it('scales near-silence by no more than the cap', () => {
    expect(displayGain([0.01])).toBe(MAX_DISPLAY_GAIN);
  });

  it('leaves silence and full-scale audio alone', () => {
    expect(displayGain([0, 0])).toBe(1);
    expect(displayGain([1])).toBe(1);
  });
});

describe('waveformGeometry', () => {
  it('draws one bar per 6px slot, centered, whole segments tall', () => {
    // 22px wide: 4 slots (24px less the last gap). 16px tall: 2 segment rows each side.
    const { bars, cells, stripeY } = waveformGeometry([1, 0.5, 0, 0.2], 22, 16);
    expect(bars).toBe('M0 0.5h4v15h-4z' + 'M6 4.5h4v7h-4z' + 'M12 4.5h4v7h-4z' + 'M18 4.5h4v7h-4z');
    expect(cells).toBe('M0 0.5h4v15h-4zM6 0.5h4v15h-4zM12 0.5h4v15h-4zM18 0.5h4v15h-4z');
    expect(stripeY).toBe(8.5);
  });

  it('always draws at least one bar', () => {
    expect(waveformGeometry([1], 1, 8).bars).toMatch(/^M[-\d.]+ /);
  });
});

describe('positionAt', () => {
  it('maps a click across the width to a time, clamped to the track', () => {
    expect(positionAt(50, 200, 180_000)).toBe(45_000);
    expect(positionAt(-10, 200, 180_000)).toBe(0);
    expect(positionAt(250, 200, 180_000)).toBe(180_000);
    expect(positionAt(10, 0, 180_000)).toBe(0);
  });
});

describe('positionForKey', () => {
  it.each([
    ['ArrowRight', 65_000],
    ['ArrowUp', 65_000],
    ['ArrowLeft', 55_000],
    ['ArrowDown', 55_000],
    ['PageUp', 90_000],
    ['PageDown', 30_000],
    ['Home', 0],
    ['End', 180_000],
  ])('%s from 1:00 goes to %i ms', (key, expected) => {
    expect(positionForKey(key, 60_000, 180_000)).toBe(expected);
  });

  it('stays within the track', () => {
    expect(positionForKey('ArrowLeft', 2_000, 180_000)).toBe(0);
    expect(positionForKey('PageUp', 170_000, 180_000)).toBe(180_000);
  });

  it('ignores other keys', () => {
    expect(positionForKey('a', 60_000, 180_000)).toBeNull();
  });
});
