import type { Metadata } from 'next';
import { SharedView } from './shared-view';

export const metadata: Metadata = {
  title: 'Shared with you',
  // Whatever a link opens is meant for whoever was sent it, never search results.
  robots: { index: false, follow: false },
};

/**
 * Where a share link lands: `/listen#<token>`. The token rides in the fragment, which browsers
 * never send to a server, so it stays out of request logs and referrers; the page reads it in the
 * browser and opens the link through a server action. Plain HTML until this page is styled
 * (docs/frontend.md), apart from the player and cover art.
 */
export default function ListenPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <SharedView />
    </main>
  );
}
