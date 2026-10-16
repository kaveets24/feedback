import { SignOutButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { z } from 'zod';
import type { TrackSummary } from '@feedback/shared';
import { serverApi } from '../lib/api';
import { formatDuration, STATUS_LABELS } from '../lib/format';
import { UploadForm } from './upload-form';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Feedback</h1>
        <p>
          Share rough song ideas, control who hears them, and collect feedback pinned to the moment.
        </p>
        <p>
          <Link href="/sign-in">Sign in</Link> or <Link href="/sign-up">create an account</Link>
        </p>
      </main>
    );
  }

  const me = await serverApi().getMe();

  if (me.accessStatus === 'pending') {
    return (
      <main>
        <h1>You&apos;re on the list</h1>
        <p>
          Feedback is invite-only for now. Your account ({me.email}) is waiting for approval.
          We&apos;ll let you in as soon as it&apos;s approved; check back here.
        </p>
        <SignOutButton />
      </main>
    );
  }

  if (me.accessStatus === 'rejected') {
    return (
      <main>
        <h1>Account not approved</h1>
        <p>Your account ({me.email}) wasn&apos;t approved for access.</p>
        <SignOutButton />
      </main>
    );
  }

  const { cursor } = await searchParams;
  // An invalid cursor (a hand-edited URL) shows the first page rather than an error.
  const page = await serverApi().listTracks(z.uuid().safeParse(cursor).success ? { cursor } : {});

  return (
    <main>
      <header>
        <p>
          Signed in as {me.email} <SignOutButton />
        </p>
      </header>
      <h1>Your tracks</h1>
      <UploadForm />

      <section aria-labelledby="tracks-heading">
        <h2 id="tracks-heading">{cursor ? 'Older tracks' : 'Tracks'}</h2>
        {page.tracks.length === 0 ? (
          <p>{cursor ? 'No older tracks.' : 'No tracks yet. Upload one above.'}</p>
        ) : (
          <ul>
            {page.tracks.map((track) => (
              <li key={track.id}>
                <Link href={`/tracks/${track.id}`}>{track.title}</Link> <TrackState track={track} />
              </li>
            ))}
          </ul>
        )}
        <nav aria-label="More tracks">
          {cursor && <Link href="/">Newest tracks</Link>}{' '}
          {page.nextCursor && <Link href={`/?cursor=${page.nextCursor}`}>Older tracks</Link>}
        </nav>
      </section>
    </main>
  );
}

/** The newest version's state, e.g. "v2 · Processing" or "v1 · 3:30". */
function TrackState({ track }: { track: TrackSummary }) {
  const { versionNumber, status, durationMs } = track.latestVersion;
  const detail =
    status === 'ready' && durationMs !== null ? formatDuration(durationMs) : STATUS_LABELS[status];
  return (
    <span>
      (v{versionNumber} · {detail})
    </span>
  );
}
