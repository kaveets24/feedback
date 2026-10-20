import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import type { VersionResponse } from '@feedback/shared';
import { serverApi } from '../../../lib/api';
import { formatDate, formatDuration, STATUS_LABELS } from '../../../lib/format';
import { loadOrNotFound } from '../../../lib/load';
import { collectPages } from '../../../lib/pages';
import { TrackPlayer } from '../../_player/track-player';
import { ProcessingStatus } from './processing-status';
import { ProjectSelect } from './project-select';

export default async function TrackPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const { trackId } = await params;
  const track = await loadOrNotFound(() => serverApi().getTrack(trackId));
  const projects = await collectPages(async (cursor) => {
    const page = await serverApi().listProjects({ cursor, limit: 100 });
    return { items: page.projects, nextCursor: page.nextCursor };
  });
  const project = projects.find((p) => p.id === track.projectId);
  const [latest] = track.versions;
  const current = track.versions.find((v) => v.id === track.currentVersionId);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <p>
        <Link href="/">Your tracks</Link>
      </p>
      <h1>{track.title}</h1>
      <p>Private: only you can see and hear this track.</p>
      {project && (
        <p>
          In <Link href={`/projects/${project.id}`}>{project.title}</Link>
        </p>
      )}
      <ProjectSelect trackId={track.id} projectId={track.projectId} projects={projects} />

      {current?.durationMs != null && current.waveformPeaks && (
        <TrackPlayer
          item={{
            versionId: current.id,
            trackId: track.id,
            title: track.title,
            versionNumber: current.versionNumber,
            durationMs: current.durationMs,
            peaks: current.waveformPeaks,
          }}
        />
      )}
      {latest && <LatestVersion version={latest} />}

      <section aria-labelledby="versions-heading">
        <h2 id="versions-heading">Versions</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Status</th>
              <th scope="col">Length</th>
              <th scope="col">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {track.versions.map((version) => (
              <tr key={version.id}>
                <th scope="row">v{version.versionNumber}</th>
                <td>{STATUS_LABELS[version.status]}</td>
                <td>{version.durationMs != null ? formatDuration(version.durationMs) : '—'}</td>
                <td>
                  <time dateTime={version.createdAt}>{formatDate(version.createdAt)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

/** What's happening with the newest upload, when it isn't simply ready. */
function LatestVersion({ version }: { version: VersionResponse }) {
  switch (version.status) {
    case 'processing':
      return <ProcessingStatus versionId={version.id} />;
    case 'failed':
      return (
        <p role="alert">
          v{version.versionNumber} couldn’t be processed: {version.failureReason}
        </p>
      );
    case 'uploading':
      return (
        <p>
          v{version.versionNumber}’s upload didn’t finish. Upload the file again from{' '}
          <Link href="/">your tracks</Link>.
        </p>
      );
    case 'ready':
      return null;
  }
}
