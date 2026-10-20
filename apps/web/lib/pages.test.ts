import { describe, expect, it, vi } from 'vitest';
import { collectPages } from './pages';

describe('collectPages', () => {
  it('follows nextCursor to the last page', async () => {
    const pages: Record<string, { items: number[]; nextCursor: string | null }> = {
      first: { items: [1, 2], nextCursor: 'b' },
      b: { items: [3, 4], nextCursor: 'c' },
      c: { items: [5], nextCursor: null },
    };
    const fetchPage = vi.fn(async (cursor: string | undefined) => pages[cursor ?? 'first']!);
    await expect(collectPages(fetchPage)).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, 'b', 'c']);
  });

  it('stops after maxPages', async () => {
    const fetchPage = vi.fn(async () => ({ items: [0], nextCursor: 'more' }));
    await expect(collectPages(fetchPage, 3)).resolves.toEqual([0, 0, 0]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});
