import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { cache } from 'react';
import { getMe, viewerApi } from '../../../lib/api';
import { loadOrNotFound } from '../../../lib/load';
import { collectPages } from '../../../lib/pages';
import { ProfileView, type Tab } from './profile-view';

type Params = { params: Promise<{ handle: string }> };

// The metadata and the page both need the profile; `cache` makes them share one API call.
const loadProfile = cache(async (handle: string) =>
  loadOrNotFound(async () => (await viewerApi()).getPublicProfile(handle)),
);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const profile = await loadProfile((await params).handle);
  const name = profile.displayName ?? `@${profile.handle}`;
  return { title: name };
}

/**
 * Someone's public page, at /@handle (see the rewrite in next.config.ts), the same for everyone,
 * the owner included: only their public tracks and projects (see `ProfileView`).
 */
export default async function PublicProfilePage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ tab?: string }> }) {
  const profile = await loadProfile((await params).handle);
  const tab: Tab = (await searchParams).tab === 'projects' ? 'projects' : 'tracks';
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
  // Public lists only carry tracks with a ready version; the check keeps a stray one unplayable.
  const playable = tracks.filter((track) => track.latestVersion.status === 'ready');

  return (
    <ProfileView
      profile={profile}
      tab={tab}
      playable={playable}
      projects={projects}
      isYou={isYou}
      // Accounts waiting for approval (or turned away) can't follow, so they get no button.
      canFollow={!isYou && (!me || me.accessStatus === 'approved')}
      signedIn={!!me}
    />
  );
}
