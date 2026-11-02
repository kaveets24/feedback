import { currentAvatar, findProjectsByIds, withCurrentVersions, type Profile } from '@feedback/db';
import type {
  ProjectListResponse,
  PublicProfileResponse,
  TrackListResponse,
} from '@feedback/shared';
import { canAccessProject } from '../../auth/authz.ts';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import { COVER_URL_SECONDS, coverImages, type CoverDeps } from '../covers/images.ts';
import { toProjectResponse } from '../projects/service.ts';
import { toTrackSummaries } from '../tracks/service.ts';
import { isFollowing } from '../follows/repo.ts';
import { findPublicProfile, listPublicProjects, listPublicTracks } from './repo.ts';

// Someone's public page. It shows what everyone may see, decided as nobody in particular: the
// owner, or someone holding a link to one of their tracks, sees the same page as a stranger.
const everyone: Actor = { kind: 'anonymous' };

/** The approved profile with this handle (any case), or the usual 404. */
async function loadProfile(db: CoverDeps['db'], handle: string): Promise<Profile> {
  const profile = await findPublicProfile(db, handle.toLowerCase());
  if (!profile) throw httpError(404, 'NOT_FOUND', 'Not found');
  return profile;
}

/** Their page, and whether the asker follows them (the one thing that depends on who's asking). */
export async function getPublicProfile(
  { db, storage }: CoverDeps,
  actor: Actor,
  handle: string,
): Promise<PublicProfileResponse> {
  const profile = await loadProfile(db, handle);
  const avatar = profile.currentAvatarId ? await currentAvatar(db, profile.userId) : null;
  const following = actor.kind === 'user' && (await isFollowing(db, actor.user.id, profile.userId));
  return {
    // Set, since that's how it was found.
    handle: profile.handle ?? handle,
    displayName: profile.displayName,
    bio: profile.bio,
    city: profile.city,
    avatar: avatar?.imageKey
      ? {
          url: await storage.presignDownload({
            key: avatar.imageKey,
            expiresIn: COVER_URL_SECONDS,
          }),
          expiresAt: new Date(Date.now() + COVER_URL_SECONDS * 1000).toISOString(),
        }
      : null,
    following,
  };
}

/** Their public tracks that have something to play, newest first, a page at a time. */
export async function listProfileTracks(
  { db }: CoverDeps,
  handle: string,
  { cursor, limit }: { cursor?: string; limit: number },
): Promise<TrackListResponse> {
  const { userId } = await loadProfile(db, handle);
  // One extra row says whether there's another page.
  const rows = await listPublicTracks(db, userId, { limit: limit + 1, before: cursor });
  const page = rows.slice(0, limit);
  const projects = await findProjectsByIds(
    db,
    page.flatMap((track) => (track.projectId ? [track.projectId] : [])),
  );
  return {
    tracks: toTrackSummaries(everyone, await withCurrentVersions(db, page), projects),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Their public projects, newest first, a page at a time. */
export async function listProfileProjects(
  deps: CoverDeps,
  handle: string,
  { cursor, limit }: { cursor?: string; limit: number },
): Promise<ProjectListResponse> {
  const { userId } = await loadProfile(deps.db, handle);
  const rows = await listPublicProjects(deps.db, userId, { limit: limit + 1, before: cursor });
  const page = rows.slice(0, limit);
  const visible = page.filter((project) => canAccessProject(everyone, project, 'view'));
  const covers = await coverImages(deps, visible);
  return {
    projects: visible.map((project) => toProjectResponse(project, covers.get(project.id) ?? null)),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}
