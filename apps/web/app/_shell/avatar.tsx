import type { CoverImage } from '@feedback/shared';
import { PersonIcon } from './icons';

const SIZES = {
  /** Inline beside a name, the size it signs a comment at. */
  inline: { box: 'size-5', icon: 12 },
  /** In the header, where it stands for your profile. */
  header: { box: 'size-6', icon: 14 },
  /** On the profile page, beside its controls. */
  page: { box: 'size-20', icon: 32 },
} as const;

/**
 * A profile picture, square like a cover, or a quiet placeholder until there is one. Decorative
 * (empty alt): the name always sits beside it.
 */
export function Avatar({
  avatar,
  size,
  className = '',
}: {
  avatar: CoverImage | null;
  size: keyof typeof SIZES;
  className?: string;
}) {
  const { box, icon } = SIZES[size];
  if (!avatar) {
    return (
      <span
        className={`${box} inline-flex shrink-0 items-center justify-center rounded-sm border border-rule bg-chrome-lo align-middle text-field-edge ${className}`}
      >
        <PersonIcon size={icon} />
      </span>
    );
  }
  return (
    // A plain img: the URL is a short-lived signed one for a private image, which Next's image
    // optimizer would fetch and cache on the server.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatar.url}
      alt=""
      className={`${box} inline-block shrink-0 rounded-sm border border-rule bg-chrome-lo object-cover align-middle ${className}`}
    />
  );
}
