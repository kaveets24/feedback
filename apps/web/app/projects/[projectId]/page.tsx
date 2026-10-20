import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { serverApi } from '../../../lib/api';
import { formatDuration, totalDurationMs } from '../../../lib/format';
import { loadOrNotFound } from '../../../lib/load';
import { collectPages } from '../../../lib/pages';
import { SharingSection } from '../../_sharing/sharing-section';
import { ReleaseTypePicker } from '../release-type-picker';
import { AddTrackForm } from './add-track-form';
import { ProjectDetails } from './project-details';
import { ProjectTracks } from './project-tracks';

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const { projectId } = await params;
  const api = serverApi();
  const [project, { tracks }, { links }] = await loadOrNotFound(() =>
    Promise.all([
      api.getProject(projectId),
      api.listProjectTracks(projectId),
      api.listProjectShareLinks(projectId),
    ]),
  );
  // Everything the picker can offer: the artist's other tracks, and their projects' names.
  const [allTracks, allProjects] = await Promise.all([
    collectPages(async (cursor) => {
      const page = await api.listTracks({ cursor, limit: 100 });
      return { items: page.tracks, nextCursor: page.nextCursor };
    }),
    collectPages(async (cursor) => {
      const page = await api.listProjects({ cursor, limit: 100 });
      return { items: page.projects, nextCursor: page.nextCursor };
    }),
  ]);
  const projectTitles = new Map(allProjects.map((p) => [p.id, p.title]));
  const others = allTracks.filter((t) => t.projectId !== project.id);

  const total = totalDurationMs(tracks);
  const ready = tracks.filter((t) => t.latestVersion.status === 'ready').length;
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
        releaseType={<ReleaseTypePicker projectId={project.id} releaseType={project.releaseType} />}
      />

      <section aria-labelledby="tracks-heading" className="mt-12">
        <div className="mb-3 flex items-baseline gap-3">
          <h2 id="tracks-heading" className="text-lg font-semibold">
            Tracks
          </h2>
          {tracks.length > 0 && (
            <p className="text-sm text-muted">
              {count}
              {total > 0 && (
                <>
                  {' · '}
                  <span className="font-lcd tabular-nums">{formatDuration(total)}</span>
                  {/* Only ready versions have a length, so say what the total covers. */}
                  {ready < tracks.length && ` across ${ready} ready`}
                </>
              )}
            </p>
          )}
        </div>
        <ProjectTracks key={project.id} projectId={project.id} tracks={tracks} />
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
      </section>

      <SharingSection
        target={{ kind: 'project', id: project.id }}
        visibility={project.visibility}
        links={links}
      />
    </main>
  );
}
