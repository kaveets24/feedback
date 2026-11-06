import Link from 'next/link';
import type { ProjectDetailResponse } from '@feedback/shared';

/** Who made a project, under its title: linked if they have a public page, and only if named. */
export function ArtistLine({ artist }: { artist: ProjectDetailResponse['artist'] }) {
  const name = artist?.displayName ?? (artist?.handle && `@${artist.handle}`);
  if (!name) return null;
  return (
    <p className="mt-1 text-sm text-muted">
      By{' '}
      {artist?.handle ? (
        <Link href={`/@${artist.handle}`} className="link text-ink">
          {name}
        </Link>
      ) : (
        <span className="text-ink">{name}</span>
      )}
    </p>
  );
}
