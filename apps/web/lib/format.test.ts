import { describe, expect, it } from 'vitest';
import type { TrackSummary } from '@feedback/shared';
import { formatDate, formatDuration, totalDurationMs } from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [999, '0:00'],
    [5_000, '0:05'],
    [210_000, '3:30'],
    [1_200_000, '20:00'],
    [3_723_000, '1:02:03'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatDate', () => {
  it('keeps the UTC date', () => {
    expect(formatDate('2026-10-16T23:59:00.000Z')).toBe('October 16, 2026');
    expect(formatDate('2026-01-01T00:00:00.000Z')).toBe('January 1, 2026');
  });
});

describe('totalDurationMs', () => {
  const track = (status: TrackSummary['latestVersion']['status'], durationMs: number | null) =>
    ({ latestVersion: { id: 'v', versionNumber: 1, status, durationMs } }) as TrackSummary;

  it('adds up ready versions and skips the rest', () => {
    expect(
      totalDurationMs([track('ready', 60_000), track('processing', null), track('ready', 30_500)]),
    ).toBe(90_500);
    expect(totalDurationMs([])).toBe(0);
  });
});
