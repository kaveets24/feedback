import Link from 'next/link';
import { serverApi, viewerApi } from '../../../lib/api';
import { formatDuration } from '../../../lib/format';
import { loadOrSignIn } from '../../../lib/load';
import { collectPages } from '../../../lib/pages';
import { queueItems } from '../../../lib/player-item';
import { PlayAlbumButton } from '../../_album/album';
import { ListenerProject } from '../../_listen/listener-view';
import { SharingSection } from '../../_sharing/sharing-section';
import { ReleaseTypePicker } from '../release-type-picker';
import { AddTrackForm } from './add-track-form';
import { ProjectDetails } from './project-details';
import { ProjectTracks } from './project-tracks';

/**
 * A project: everything for its owner, and what a listener may see for anyone else, which only
 * reaches them for a public project (link holders come by the listen page).
 */
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const viewer = await viewerApi();
  const [project, { tracks }] = await loadOrSignIn(() =>
    Promise.all([viewer.getProject(projectId), viewer.listProjectTracks(projectId)]),
  );
  if (!project.canManage) {
    // The list has no waveforms; each track's own response does. Projects hold tens of tracks.
    const full = await loadOrSignIn(() => Promise.all(tracks.map((t) => viewer.getTrack(t.id))));
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <ListenerProject project={project} tracks={full} token={null} />
      </main>
    );
  }

  const api = serverApi();
  const { links } = await api.listProjectShareLinks(projectId);
  // Everything the picker can offer: the artist's other tracks, and their projects' names.
  // The list has no waveforms, and the mini-player draws them, so ready tracks need their own.
  const [allTracks, allProjects, ready] = await Promise.all([
    collectPages(async (cursor) => {
      const page = await api.listTracks({ cursor, limit: 100 });
      return { items: page.tracks, nextCursor: page.nextCursor };
    }),
    collectPages(async (cursor) => {
      const page = await api.listProjects({ cursor, limit: 100 });
      return { items: page.projects, nextCursor: page.nextCursor };
    }),
    Promise.all(tracks.filter((t) => t.currentVersionId).map((t) => api.getTrack(t.id))),
  ]);
  const playable = queueItems(ready, null);
  const projectTitles = new Map(allProjects.map((p) => [p.id, p.title]));
  const others = allTracks.filter((t) => t.projectId !== project.id);

  // What pressing Play plays, which skips any track with nothing ready.
  const total = playable.reduce((sum, item) => sum + item.durationMs, 0);
  const count = tracks.length === 1 ? '1 track' : `${tracks.length} tracks`;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <p className="mb-3 text-sm">
        <Link href="/projects" className="link text-muted">
          Projects
        </Link>
      </p>
      <ProjectDetails
        project={project}
        trackCount={tracks.length}
        play={
          playable.length > 0 && (
            <PlayAlbumButton projectId={project.id} title={project.title} items={playable} />
          )
        }
        releaseType={<ReleaseTypePicker projectId={project.id} releaseType={project.releaseType} />}
      />

      <ProjectTracks
        key={project.id}
        projectId={project.id}
        tracks={tracks}
        playable={playable}
        summary={
          tracks.length > 0 && (
            <p className="text-sm text-muted">
              {count}
              {total > 0 && (
                <>
                  {' · '}
                  <span className="font-lcd tabular-nums">{formatDuration(total)}</span>
                  {/* Only ready versions have a length, so say what the total covers. */}
                  {playable.length < tracks.length && ` across ${playable.length} ready`}
                </>
              )}
            </p>
          )
        }
        addTrack={
          <AddTrackForm
            projectId={project.id}
            hasTracks={allTracks.length > 0}
            loose={others.filter((t) => t.projectId === null)}
            elsewhere={others.flatMap((t) =>
              t.projectId
                ? [{ ...t, projectTitle: projectTitles.get(t.projectId) ?? 'another project' }]
                : [],
            )}
          />
        }
      />

      <SharingSection
        target={{ kind: 'project', id: project.id }}
        visibility={project.visibility}
        links={links}
      />
    </main>
  );
}
