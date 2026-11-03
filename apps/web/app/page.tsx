import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { genreSchema, searchTermSchema } from '@feedback/shared';
import { getMe, viewerApi } from '../lib/api';
import { DiscoverView } from './_discover/discover-view';

/**
 * Home, for everyone: public tracks, the most recently updated first, narrowed by a genre or a
 * search, which also finds people (see `DiscoverView`).
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; genre?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  // A hand-edited URL shows everything, or the first page, rather than an error.
  const genre = genreSchema.safeParse(params.genre).data;
  const cursor = z.uuid().safeParse(params.cursor).data;
  const typed = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  // Too short to search: say so, and show everything meanwhile.
  const q = searchTermSchema.safeParse(typed).data;

  const { isAuthenticated } = await auth();
  const me = isAuthenticated ? await getMe() : null;
  const api = await viewerApi();
  const [page, people] = await Promise.all([
    api.discover({ q, genre, cursor }),
    // People sit above the first page of tracks only.
    q && !cursor ? api.searchProfiles({ q }).then((found) => found.artists) : [],
  ]);

  return (
    <DiscoverView
      me={me}
      typed={typed}
      q={q}
      genre={genre}
      cursor={cursor}
      page={page}
      people={people}
    />
  );
}
