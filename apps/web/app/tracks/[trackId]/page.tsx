import { auth } from '@clerk/nextjs/server';
import { serverApi } from '../../../lib/api';
import { loadOrNotFound } from '../../../lib/load';
import { collectPages } from '../../../lib/pages';
import { TrackView } from './track-view';

export default async function TrackPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const { trackId } = await params;
  const [track, { links }] = await loadOrNotFound(() =>
    Promise.all([serverApi().getTrack(trackId), serverApi().listTrackShareLinks(trackId)]),
  );
  const projects = await collectPages(async (cursor) => {
    const page = await serverApi().listProjects({ cursor, limit: 100 });
    return { items: page.projects, nextCursor: page.nextCursor };
  });
  const ready = track.versions.filter((v) => v.status === 'ready');
  const lists = await Promise.all(ready.map((v) => serverApi().listFeedback(v.id)));
  const feedback = Object.fromEntries(ready.map((v, i) => [v.id, lists[i]!.threads]));
  return <TrackView track={track} projects={projects} links={links} feedback={feedback} />;
}
