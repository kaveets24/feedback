import { describe, expect, it } from 'vitest';
import { pollDelayMs } from './use-version-status';

describe('pollDelayMs', () => {
  it('starts at 2 seconds and backs off to at most 10', () => {
    expect([0, 1, 2, 3, 4, 10].map(pollDelayMs)).toEqual([2000, 3000, 4500, 6750, 10_000, 10_000]);
  });
});
