import Link from 'next/link';
import type { ProjectResponse, TrackResponse, VersionResponse } from '@feedback/shared';
import type { PlayerItem } from '../../../lib/audio-store';
import { formatDate, formatDuration, STATUS_LABELS } from '../../../lib/format';
import { TrackPlayer } from '../../_player/track-player';
import { UploadForm } from '../../upload-form';
import { ProcessingStatus } from './processing-status';
import { ProjectSelect } from './project-select';
import { VersionRow } from './version-notes';

/** The track page's body: its place, the player, the version history, and a new version's upload. */
export function TrackView({
  track,
  projects,
}: {
  track: TrackResponse;
  projects: ProjectResponse[];
}) {
  const project = projects.find((p) => p.id === track.projectId);
  const [latest] = track.versions;
  const current = track.versions.find((v) => v.id === track.currentVersionId);
  // A version whose file never arrived has nothing to show, unless it's the newest: that upload
  // may still be running.
  const history = track.versions.filter((v) => v.status !== 'uploading' || v === latest);
  const playable = track.versions.flatMap((v) => playerItem(track, v) ?? []);
  const currentItem = playable.find((v) => v.versionId === current?.id);
  const older = playable.filter((v) => v !== currentItem);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <p className="mb-3 text-sm">
        <Link href="/" className="link text-muted">
          Your tracks
        </Link>
      </p>
      <h1 className="text-3xl font-semibold break-words text-balance">{track.title}</h1>
      <p className="mt-2 text-sm text-muted">
        {project && (
          <>
            In{' '}
            <Link href={`/projects/${project.id}`} className="link">
              {project.title}
            </Link>
            {' · '}
          </>
        )}
        Private: only you can see and hear this track.
      </p>
      <div className="mt-4 max-w-md">
        <ProjectSelect trackId={track.id} projectId={track.projectId} projects={projects} />
      </div>

      {currentItem && (
        <div className="mt-8">
          <TrackPlayer current={currentItem} older={older} />
        </div>
      )}
      {latest && (
        <div className="mt-3">
          <LatestVersion version={latest} />
        </div>
      )}

      <section aria-labelledby="versions-heading" className="mt-12">
        <h2 id="versions-heading" className="mb-3 text-lg font-semibold">
          Versions
        </h2>
        {/* Not an ordered list: the V-number is the order, and failed uploads leave gaps. */}
        <ul className="border-t border-rule">
          {history.map((version) => (
            <li key={version.id} className="border-b border-rule py-3">
              <VersionRow
                versionId={version.id}
                versionNumber={version.versionNumber}
                notes={version.changeNotes}
                meta={<VersionMeta version={version} current={version.id === current?.id} />}
                length={
                  <span className="hidden pt-0.5 text-right font-lcd text-base tabular-nums sm:block">
                    {version.durationMs != null ? (
                      formatDuration(version.durationMs)
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <UploadForm trackId={track.id} />
      </section>
    </main>
  );
}

/** A ready version, as the player plays it; null for one that isn't ready. */
function playerItem(track: TrackResponse, version: VersionResponse): PlayerItem | null {
  if (version.status !== 'ready' || version.durationMs == null || !version.waveformPeaks) {
    return null;
  }
  return {
    versionId: version.id,
    trackId: track.id,
    title: track.title,
    versionNumber: version.versionNumber,
    durationMs: version.durationMs,
    peaks: version.waveformPeaks,
  };
}

/** "Current · Ready · 3:42 · 2026-10-20", and why it failed when it did. */
function VersionMeta({ version, current }: { version: VersionResponse; current: boolean }) {
  const failed = version.status === 'failed';
  return (
    <>
      <p className="mt-1 text-sm text-muted">
        {current && <span className="font-medium text-ink">Current · </span>}
        <span className={failed ? 'text-danger' : undefined}>{STATUS_LABELS[version.status]}</span>
        {/* On phones the length column is hidden, so it rides in this line. */}
        {version.durationMs != null && (
          <span className="sm:hidden">
            {' · '}
            <span className="font-lcd text-base text-ink tabular-nums">
              {formatDuration(version.durationMs)}
            </span>
          </span>
        )}
        {' · '}
        <time dateTime={version.createdAt}>{formatDate(version.createdAt)}</time>
      </p>
      {failed && version.failureReason && (
        <p className="mt-1 text-sm text-pretty text-danger">{version.failureReason}</p>
      )}
    </>
  );
}

/** What's happening with the newest upload, when it isn't simply ready. */
function LatestVersion({ version }: { version: VersionResponse }) {
  switch (version.status) {
    case 'processing':
      return <ProcessingStatus versionId={version.id} versionNumber={version.versionNumber} />;
    case 'failed':
      return (
        <p role="alert" className="text-sm text-danger">
          v{version.versionNumber} couldn’t be processed: {version.failureReason}
        </p>
      );
    case 'uploading':
      return (
        <p className="text-sm text-muted">
          v{version.versionNumber}’s upload hasn’t finished. If it stopped, upload the file again
          below.
        </p>
      );
    case 'ready':
      return null;
  }
}
