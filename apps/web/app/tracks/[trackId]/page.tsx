import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ApiError, type TrackResponse, type VersionResponse } from '@feedback/shared';
import { serverApi } from '../../../lib/api';
import { formatDate, formatDuration, STATUS_LABELS } from '../../../lib/format';
import { TrackPlayer } from '../../_player/track-player';
import { ProcessingStatus } from './processing-status';

async function loadTrack(trackId: string): Promise<TrackResponse> {
  try {
    return await serverApi().getTrack(trackId);
  } catch (err) {
    // Someone else's track looks the same as a missing one (CLAUDE.md section 6, rule 9).
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    // Not approved yet: the home page explains.
    if (err instanceof ApiError && err.status === 403) redirect('/');
    throw err;
  }
}

export default async function TrackPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const track = await loadTrack((await params).trackId);
  const [latest] = track.versions;
  const current = track.versions.find((v) => v.id === track.currentVersionId);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <p>
        <Link href="/">Your tracks</Link>
      </p>
      <h1>{track.title}</h1>
      <p>Private: only you can see and hear this track.</p>

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
