import { describe, expect, it } from 'vitest';
import { canTransition, statusesBefore, VERSION_STATUSES, type VersionStatus } from './tracks.ts';

const allowed: [VersionStatus, VersionStatus][] = [
  ['uploading', 'processing'],
  ['uploading', 'failed'],
  ['processing', 'ready'],
  ['processing', 'failed'],
];

describe('canTransition', () => {
  const pairs = VERSION_STATUSES.flatMap((from) => VERSION_STATUSES.map((to) => [from, to]));

  it.each(pairs)('%s -> %s', (from, to) => {
    const expected = allowed.some(([f, t]) => f === from && t === to);
    expect(canTransition(from as VersionStatus, to as VersionStatus)).toBe(expected);
  });
});

describe('statusesBefore', () => {
  it('lists where each status can be reached from', () => {
    expect(statusesBefore('uploading')).toEqual([]);
    expect(statusesBefore('processing')).toEqual(['uploading']);
    expect(statusesBefore('ready')).toEqual(['processing']);
    expect(statusesBefore('failed')).toEqual(['uploading', 'processing']);
  });
});
