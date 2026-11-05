import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { discoverViewSchema, genreSchema, searchTermSchema } from '@feedback/shared';
import { getMe, serverApi, viewerApi } from '../lib/api';
import { collectPages } from '../lib/pages';
import { DiscoverView } from './_discover/discover-view';
import { AuthModalOpener } from './_shell/auth-modal-opener';

/**
 * Home, for everyone: public tracks, the most recently updated first, narrowed by a genre or a
 * search, which also finds people, or for an approved account by who they follow (see
 * `DiscoverView`). A visit to `/sign-in` or `/sign-up` arrives here with `auth` set, to open the
 * modal over it.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    genre?: string;
    cursor?: string;
    auth?: string;
    redirect_url?: string;
  }>;
}) {
  const params = await searchParams;
  const authModal = params.auth === 'sign-in' || params.auth === 'sign-up' ? params.auth : null;
  // A hand-edited URL shows everything, or the first page, rather than an error.
  const genre = genreSchema.safeParse(params.genre).data;
  const cursor = z.uuid().safeParse(params.cursor).data;
  const typed = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  // Too short to search: say so, and show everything meanwhile.
  const q = searchTermSchema.safeParse(typed).data;

  const { isAuthenticated } = await auth();
  const me = isAuthenticated ? await getMe() : null;
  // Following needs an approved account; anyone else gets everyone's tracks.
  const view =
    me?.accessStatus === 'approved' &&
    discoverViewSchema.safeParse(params.view).data === 'following'
      ? 'following'
      : 'everyone';
  const api = view === 'following' ? serverApi() : await viewerApi();
  const [page, people, following] = await Promise.all([
    api.discover({ view, q, genre, cursor }),
    // People sit above the first page of tracks only.
    q && !cursor ? api.searchProfiles({ q }).then((found) => found.artists) : [],
    view === 'following'
      ? collectPages(async (next) => {
          const result = await api.listFollowing({ cursor: next, limit: 50 });
          return { items: result.artists, nextCursor: result.nextCursor };
        })
      : null,
  ]);

  return (
    <>
      <DiscoverView
        me={me}
        view={view}
        following={following}
        typed={typed}
        q={q}
        genre={genre}
        cursor={cursor}
        page={page}
        people={people}
      />
      {authModal && <AuthModalOpener modal={authModal} returnTo={params.redirect_url} />}
    </>
  );
}
