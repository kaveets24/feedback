import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MiniPlayer } from './_player/mini-player';
import { AppHeader } from './_shell/app-header';
import { lcdFont } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Feedback',
  description: 'Share unfinished music and get feedback on it.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={lcdFont.variable}>
      <body className="flex min-h-dvh flex-col bg-canvas text-ink antialiased">
        {/* Set here, not only via NEXT_PUBLIC_CLERK_SIGN_*_URL: those are inlined at build time, and
            when one is missing Clerk links to its hosted Account Portal (accounts.<domain>). */}
        <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
          <AppHeader />
          <div className="flex-1">{children}</div>
          {/* Outside the pages, so playback carries on across navigation. */}
          <MiniPlayer />
        </ClerkProvider>
      </body>
    </html>
  );
}
