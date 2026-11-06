import { describe, expect, it } from 'vitest';
import { formatDate, formatDuration, truncate } from './format';

describe('truncate', () => {
  it('leaves text that fits alone', () => {
    expect(truncate('Night Drive', 11)).toBe('Night Drive');
  });

  it('cuts longer text to the limit, ellipsis included', () => {
    expect(truncate('Night Drive', 6)).toBe('Night…');
  });

  it('leaves no space before the ellipsis', () => {
    expect(truncate('Night Drive', 7)).toBe('Night…');
  });

  it('never splits an emoji', () => {
    expect(truncate('🎸🎸🎸🎸', 3)).toBe('🎸🎸…');
  });
});

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
