'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  {
    href: '/',
    label: 'Tracks',
    matches: (path: string) => path === '/' || path.startsWith('/tracks/'),
  },
  {
    href: '/projects',
    label: 'Projects',
    matches: (path: string) => path === '/projects' || path.startsWith('/projects/'),
  },
];

/** The main sections, with the current one underlined in the accent. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex h-full items-stretch gap-1">
      {LINKS.map(({ href, label, matches }) => {
        const current = matches(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={`focus-glow flex items-center rounded-sm px-2 text-sm font-medium hover:text-accent sm:px-3 ${
              current ? 'text-ink shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-muted'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
