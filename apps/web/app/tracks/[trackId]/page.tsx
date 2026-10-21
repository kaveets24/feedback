import { auth } from '@clerk/nextjs/server';
import { serverApi } from '../../../lib/api';
import { loadOrNotFound } from '../../../lib/load';
import { collectPages } from '../../../lib/pages';
import { TrackView } from './track-view';

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ trackId: string }>;
  /** `comment`: a comment (or reply) to open at, from a notification. */
  searchParams: Promise<{ comment?: string }>;
}) {
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
  const { comment } = await searchParams;
  const openAt = ready.flatMap((v, i) =>
    lists[i]!.threads.flatMap((t) =>
      t.id === comment || t.replies.some((r) => r.id === comment)
        ? [{ versionId: v.id, threadId: t.id }]
        : [],
    ),
  )[0];
  return (
    <TrackView
      track={track}
      projects={projects}
      links={links}
      feedback={feedback}
      openAt={openAt}
    />
  );
}
