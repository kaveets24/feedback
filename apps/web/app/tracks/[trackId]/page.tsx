import { auth } from '@clerk/nextjs/server';
import { serverApi } from '../../../lib/api';
import { loadOrNotFound } from '../../../lib/load';
import { collectPages } from '../../../lib/pages';
import { TrackView } from './track-view';

export default async function TrackPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const { trackId } = await params;
  const track = await loadOrNotFound(() => serverApi().getTrack(trackId));
  const projects = await collectPages(async (cursor) => {
    const page = await serverApi().listProjects({ cursor, limit: 100 });
    return { items: page.projects, nextCursor: page.nextCursor };
  });
  return <TrackView track={track} projects={projects} />;
}
