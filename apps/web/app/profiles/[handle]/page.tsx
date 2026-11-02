import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { CITY_LABELS } from '@feedback/shared';
import { getMe, viewerApi } from '../../../lib/api';
import { formatDuration } from '../../../lib/format';
import { loadOrNotFound } from '../../../lib/load';
import { collectPages } from '../../../lib/pages';
import { Avatar } from '../../_shell/avatar';
import { FollowButton } from './follow-button';

type Params = { params: Promise<{ handle: string }> };

// The metadata and the page both need the profile; `cache` makes them share one API call.
const loadProfile = cache(async (handle: string) =>
  loadOrNotFound(async () => (await viewerApi()).getPublicProfile(handle)),
);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const profile = await loadProfile((await params).handle);
  const name = profile.displayName ?? `@${profile.handle}`;
  return { title: `${name} · Feedback` };
}

/**
 * Someone's public page, at /@handle (see the rewrite in next.config.ts): their profile and only
 * their public tracks and projects, the same for everyone, the owner included. Plain HTML until
 * it's styled (CLAUDE.md section 9), apart from the picture.
 */
export default async function PublicProfilePage({ params }: Params) {
  const profile = await loadProfile((await params).handle);
  const api = await viewerApi();
  const [projects, tracks] = await Promise.all([
    collectPages(async (cursor) => {
      const page = await api.listProfileProjects(profile.handle, { cursor, limit: 100 });
      return { items: page.projects, nextCursor: page.nextCursor };
    }),
    collectPages(async (cursor) => {
      const page = await api.listProfileTracks(profile.handle, { cursor, limit: 100 });
      return { items: page.tracks, nextCursor: page.nextCursor };
    }),
  ]);
  const { isAuthenticated } = await auth();
  const me = isAuthenticated ? await getMe() : null;
  const isYou = me?.profile?.handle === profile.handle;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Avatar avatar={profile.avatar} size="page" />
      <h1>{profile.displayName ?? `@${profile.handle}`}</h1>
      <p>
        @{profile.handle}
        {profile.city && <> · {CITY_LABELS[profile.city]}</>}
      </p>
      {profile.bio && <p>{profile.bio}</p>}
      {/* Accounts waiting for approval (or turned away) can't follow, so they get no button. */}
      {!isYou && (!me || me.accessStatus === 'approved') && (
        <FollowButton handle={profile.handle} following={profile.following} signedIn={!!me} />
      )}
      {isYou && (
        <p>
          This is your public page: everyone sees it like this, with only what you’ve made public.{' '}
          <Link href="/settings/profile">Edit your profile</Link>
        </p>
      )}

      {projects.length > 0 && (
        <>
          <h2>Projects</h2>
          <ul>
            {projects.map((project) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`}>{project.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Tracks</h2>
      {tracks.length === 0 ? (
        <p>No public tracks yet.</p>
      ) : (
        <ul>
          {tracks.map((track) => (
            <li key={track.id}>
              <Link href={`/tracks/${track.id}`}>{track.title}</Link> (
              {formatDuration(track.latestVersion.durationMs ?? 0)})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
