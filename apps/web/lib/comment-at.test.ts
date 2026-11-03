import { describe, expect, it } from 'vitest';
import { commentAt, type FeedbackMarker } from './comment-at';

const marker = (id: string, timestampMs: number): FeedbackMarker => ({
  id,
  timestampMs,
  resolved: false,
  author: 'Someone',
  body: id,
});
const markers = [
  marker('a', 10_000),
  marker('b', 20_000),
  marker('c', 20_000),
  marker('d', 60_000),
];

describe('commentAt', () => {
  it('shows the first comment ahead, as next, before the playhead reaches any', () => {
    expect(commentAt(markers, 0, null)).toEqual({ marker: markers[0], index: 0, upcoming: true });
  });

  it('shows the last comment the playhead has passed, the latest of any at the same moment', () => {
    expect(commentAt(markers, 10_000, null)?.marker.id).toBe('a');
    expect(commentAt(markers, 45_000, null)).toMatchObject({ index: 2, upcoming: false });
    expect(commentAt(markers, 999_000, null)?.marker.id).toBe('d');
  });

  it('shows the comment being pointed at, wherever the playhead is', () => {
    expect(commentAt(markers, 0, 'd')).toEqual({ marker: markers[3], index: 3, upcoming: false });
    expect(commentAt(markers, 45_000, 'gone')?.marker.id).toBe('c');
  });

  it('shows nothing when there are no pinned comments', () => {
    expect(commentAt([], 5000, null)).toBeNull();
  });
});
