import type { CoverImage } from '@feedback/shared';
import { NoteIcon } from '../_shell/icons';

const SIZES = {
  /** A thumbnail leading a row of the projects list. */
  list: { box: 'size-12', icon: 20 },
  /** Beside the title on the project page: 96px on phones, 128px from `sm`. */
  page: { box: 'size-24 sm:size-32', icon: 32 },
} as const;

/**
 * A project's cover art, square, or a quiet placeholder until it has some. `alt` is empty by
 * default, since the project's title is always right beside it.
 */
export function ProjectCover({
  cover,
  size,
  alt = '',
}: {
  cover: CoverImage | null;
  size: keyof typeof SIZES;
  alt?: string;
}) {
  const { box, icon } = SIZES[size];
  if (!cover) {
    return (
      <div
        className={`${box} flex shrink-0 items-center justify-center rounded-sm border border-rule bg-chrome-lo text-field-edge`}
      >
        <NoteIcon size={icon} />
      </div>
    );
  }
  return (
    // A plain img: the URL is a short-lived signed one for a private image, which Next's image
    // optimizer would fetch and cache on the server.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cover.url}
      alt={alt}
      className={`${box} shrink-0 rounded-sm border border-rule bg-chrome-lo object-cover`}
    />
  );
}
