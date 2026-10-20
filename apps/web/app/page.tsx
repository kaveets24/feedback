import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { getMe, serverApi } from '../lib/api';
import { TrackLength, TrackSubtitle } from './_shell/track-meta';
import { UploadForm } from './upload-form';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl px-4 pt-16 pb-16">
        {/* The wordmark already says "Feedback" right above, so the name is for screen readers
            and the pitch leads. */}
        <h1 className="sr-only">Feedback</h1>
        <p className="max-w-[24ch] text-3xl font-semibold text-balance">
          Share rough song ideas, control who hears them, and collect feedback pinned to the moment.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/sign-in" className="btn btn-primary">
            Sign in
          </Link>
          <Link href="/sign-up" className="btn">
            Create an account
          </Link>
        </div>
      </main>
    );
  }

  const me = await getMe();

  if (me.accessStatus === 'pending') {
    return (
      <Message title="You’re on the list">
        <p>
          Feedback is invite-only for now. Your account (
          <span className="font-medium text-ink">{me.email}</span>) is waiting for approval. We’ll
          let you in as soon as it’s approved; check back here.
        </p>
      </Message>
    );
  }

  if (me.accessStatus === 'rejected') {
    return (
      <Message title="Account not approved">
        <p>
          Your account (<span className="font-medium text-ink">{me.email}</span>) wasn’t approved
          for access.
        </p>
      </Message>
    );
  }

  const { cursor } = await searchParams;
  // An invalid cursor (a hand-edited URL) shows the first page rather than an error.
  const page = await serverApi().listTracks(z.uuid().safeParse(cursor).success ? { cursor } : {});

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <h1 className="text-3xl font-semibold">Your tracks</h1>
      <div className="mt-6">
        <UploadForm />
      </div>

      <section aria-labelledby="tracks-heading" className="mt-12">
        <h2 id="tracks-heading" className="mb-3 text-lg font-semibold">
          {cursor ? 'Older tracks' : 'Tracks'}
        </h2>
        {page.tracks.length === 0 ? (
          <p className="border-y border-rule py-6 text-muted">
            {cursor ? 'No older tracks.' : 'No tracks yet. Upload one above.'}
          </p>
        ) : (
          <ul className="border-t border-rule">
            {page.tracks.map((track) => (
              <li
                key={track.id}
                className="relative flex items-center gap-4 border-b border-rule py-3 hover:bg-chrome-lo/60"
              >
                <div className="min-w-0 flex-1">
                  {/* The link's hit area covers the whole row. */}
                  <Link
                    href={`/tracks/${track.id}`}
                    className="row-link line-clamp-2 font-medium break-words sm:line-clamp-1"
                  >
                    {track.title}
                  </Link>
                  <TrackSubtitle track={track} />
                </div>
                <TrackLength track={track} />
              </li>
            ))}
          </ul>
        )}
        <nav aria-label="More tracks" className="mt-4 flex gap-4 text-sm">
          {cursor && (
            <Link href="/" className="link">
              Newest tracks
            </Link>
          )}
          {page.nextCursor && (
            <Link href={`/?cursor=${page.nextCursor}`} className="link">
              Older tracks
            </Link>
          )}
        </nav>
      </section>
    </main>
  );
}

/** A screen with one thing to say: the waiting-list and not-approved notices. */
function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-16 pb-16">
      <h1 className="text-3xl font-semibold text-balance">{title}</h1>
      <div className="mt-3 max-w-[60ch] text-muted">{children}</div>
    </main>
  );
}
