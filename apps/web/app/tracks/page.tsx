import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { z } from 'zod';
import { serverApi } from '../../lib/api';
import { loadOrNotFound } from '../../lib/load';
import { TrackLength, TrackSubtitle } from '../_shell/track-meta';
import { UploadForm } from '../upload-form';

/** Your tracks, newest first, under the upload form. */
export default async function TracksPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const { cursor } = await searchParams;
  // An invalid cursor (a hand-edited URL) shows the first page rather than an error. Accounts
  // that aren't approved are sent home, which says why.
  const page = await loadOrNotFound(() =>
    serverApi().listTracks(z.uuid().safeParse(cursor).success ? { cursor } : {}),
  );

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
            <Link href="/tracks" className="link">
              Newest tracks
            </Link>
          )}
          {page.nextCursor && (
            <Link href={`/tracks?cursor=${page.nextCursor}`} className="link">
              Older tracks
            </Link>
          )}
        </nav>
      </section>
    </main>
  );
}
