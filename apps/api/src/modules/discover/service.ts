import type { DiscoverResponse, DiscoverView, Genre } from '@feedback/shared';
import { canAccessTrack } from '../../auth/authz.ts';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import { authorsFor } from '../feedback/service.ts';
import type { FollowDeps } from '../follows/service.ts';
import { listDiscover } from './repo.ts';

// Discovery shows what everyone may hear, decided as nobody in particular, like a public page:
// the same list for everyone, signed in or not. The `following` view only narrows whose tracks.
const everyone: Actor = { kind: 'anonymous' };

export async function discover(
  deps: FollowDeps,
  asker: Actor,
  {
    view,
    genre,
    q,
    cursor,
    limit,
  }: { view: DiscoverView; genre?: Genre; q?: string; cursor?: string; limit: number },
): Promise<DiscoverResponse> {
  let followerId: string | undefined;
  if (view === 'following') {
    if (asker.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');
    followerId = asker.user.id;
  }
  // One extra row says whether there's another page.
  const rows = await listDiscover(deps.db, {
    genre,
    q,
    followerId,
    limit: limit + 1,
    before: cursor,
  });
  const page = rows.slice(0, limit);
  const visible = page.filter(({ track, project }) =>
    canAccessTrack(everyone, track, project, 'listen'),
  );
  const artists = await authorsFor(deps.db, deps.storage, [
    ...new Set(visible.map((row) => row.track.ownerId)),
  ]);
  return {
    items: visible.map(({ track, version }) => ({
      track: { id: track.id, title: track.title, genre: track.genre },
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        // Set on every ready version.
        durationMs: version.durationMs ?? 0,
        createdAt: version.createdAt.toISOString(),
      },
      // Someone who never saved a profile has no name or picture to show.
      artist: artists.get(track.ownerId) ?? { displayName: null, handle: null, avatar: null },
    })),
    nextCursor: rows.length > limit ? (page.at(-1)?.track.currentVersionId ?? null) : null,
  };
}
