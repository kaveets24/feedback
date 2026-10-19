import { Silkscreen } from 'next/font/google';

/** Bitmap face for LCD readouts (`font-lcd`). next/font self-hosts it at build time. */
export const lcdFont = Silkscreen({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-silkscreen',
  display: 'swap',
});
