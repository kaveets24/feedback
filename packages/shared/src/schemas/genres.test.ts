import { describe, expect, it } from 'vitest';
import { GENRE_LABELS, GENRE_OPTIONS, GENRES } from './genres.ts';

describe('GENRE_OPTIONS', () => {
  it('lists every genre once, alphabetically by label, with Other last', () => {
    expect([...GENRE_OPTIONS].sort()).toEqual([...GENRES].sort());
    expect(GENRE_OPTIONS.at(-1)).toBe('other');
    const labels = GENRE_OPTIONS.slice(0, -1).map((genre) => GENRE_LABELS[genre]);
    expect(labels).toEqual(labels.toSorted((a, b) => a.localeCompare(b, 'en')));
  });
});
