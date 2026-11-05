import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MiniPlayer } from './_player/mini-player';
import { AppHeader } from './_shell/app-header';
import { PageScroller } from './_shell/page-scroller';
import { lcdFont } from './fonts';
import './globals.css';

const DESCRIPTION =
  'Share your song ideas, choose who can hear them, and get feedback pinned to moments in a track.';

// What a shared link shows, the same for every page on purpose: a link can open private work, and
// a preview goes to whatever service it's pasted into, so no page adds a track, project, or person
// to it (CLAUDE.md section 6). The icons and preview image are the files beside this one.
export const metadata: Metadata = {
  metadataBase: new URL('https://feedback.community'),
  title: { default: 'Feedback', template: '%s · Feedback' },
  description: DESCRIPTION,
  openGraph: { type: 'website', siteName: 'Feedback', title: 'Feedback', description: DESCRIPTION },
  twitter: { card: 'summary_large_image', title: 'Feedback', description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // A fixed app shell: the document never scrolls, only the page row does. On iOS Safari a scrolling
    // document hides the toolbar, and a sticky or fixed player can then stop where the toolbar was,
    // floating above the bottom of the screen. With no document scroll the toolbar never moves.
    <html lang="en" className={`${lcdFont.variable} overflow-hidden overscroll-none`}>
      <body className="bg-canvas text-ink antialiased">
        {/* Set here, not only via NEXT_PUBLIC_CLERK_SIGN_*_URL: those are inlined at build time, and
            when one is missing Clerk links to its hosted Account Portal (accounts.<domain>). */}
        <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
          {/* Its own element, not the body, since scripts add elements to the body that would take
              grid cells. */}
          <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]">
            <PageScroller>
              <AppHeader />
              {children}
            </PageScroller>
            {/* Outside the pages, so playback carries on across navigation. */}
            <MiniPlayer />
          </div>
        </ClerkProvider>
      </body>
    </html>
  );
}
