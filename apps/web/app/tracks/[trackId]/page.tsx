import { serverApi, viewerApi } from '../../../lib/api';
import { loadOrSignIn } from '../../../lib/load';
import { collectPages } from '../../../lib/pages';
import { ListenerTrack } from '../../_listen/listener-view';
import { TrackView } from './track-view';

/**
 * A track: everything for its owner, and what a listener may see for anyone else, which only
 * reaches them for a public track (link holders come by the listen page).
 */
export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ trackId: string }>;
  /** `comment`: a comment (or reply) to open at, from a notification. */
  searchParams: Promise<{ comment?: string }>;
}) {
  const { trackId } = await params;
  const track = await loadOrSignIn(async () => (await viewerApi()).getTrack(trackId));
  if (!track.canManage) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <ListenerTrack track={track} token={null} />
      </main>
    );
  }

  const { links } = await serverApi().listTrackShareLinks(trackId);
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
