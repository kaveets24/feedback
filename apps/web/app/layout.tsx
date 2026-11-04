import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MiniPlayer } from './_player/mini-player';
import { AppHeader } from './_shell/app-header';
import { PageScroller } from './_shell/page-scroller';
import { lcdFont } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Feedback',
  description: 'Share unfinished music and get feedback on it.',
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
