import type { DiscoverView as View, Genre } from '@feedback/shared';

export type Filters = { view?: View; q?: string; genre?: Genre; cursor?: string };

/** Home with a view, search, genre, and cursor, leaving out whichever is unset (or the default). */
export function href({ view, q, genre, cursor }: Filters) {
  const query = new URLSearchParams();
  if (view === 'following') query.set('view', view);
  if (q) query.set('q', q);
  if (genre) query.set('genre', genre);
  if (cursor) query.set('cursor', cursor);
  return query.size ? `/?${query}` : '/';
}
