import { describe, expect, it } from 'vitest';
import type { TrackResponse } from '@feedback/shared';
import { queueItems } from './player-item';

const track = (id: string, current: string | null): TrackResponse =>
  ({
    id,
    title: `Song ${id}`,
    currentVersionId: current,
    versions: [
      { id: 'processing', versionNumber: 2, status: 'processing', durationMs: null },
      { id: 'ready', versionNumber: 1, status: 'ready', durationMs: 1000, waveformPeaks: [0.5] },
    ],
  }) as unknown as TrackResponse;

describe('queueItems', () => {
  it('plays each track’s current version, not its newest, in the order given', () => {
    const items = queueItems([track('b', 'ready'), track('a', 'ready')], null);
    expect(items.map((i) => [i.trackId, i.versionId, i.versionNumber])).toEqual([
      ['b', 'ready', 1],
      ['a', 'ready', 1],
    ]);
  });

  it('skips a track with nothing ready', () => {
    const items = queueItems([track('a', null), track('b', 'ready')], null);
    expect(items.map((i) => i.trackId)).toEqual(['b']);
  });

  it('carries the share link only when there is one', () => {
    expect(queueItems([track('a', 'ready')], null)[0]).not.toHaveProperty('shareToken');
    expect(queueItems([track('a', 'ready')], 'token')[0]?.shareToken).toBe('token');
  });
});
