import { describe, expect, it } from 'vitest';
import { formatDate, formatDuration } from './format';

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
    expect(formatDate('2026-10-16T23:59:00.000Z')).toBe('2026-10-16');
  });
});
