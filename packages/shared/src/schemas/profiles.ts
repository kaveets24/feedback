import { z } from 'zod';
import { avatarResponseSchema } from './avatars.ts';
import { coverImageSchema } from './covers.ts';

/**
 * The cities a profile can name. Only a label the user picks for themselves: nothing filters,
 * sorts, or ranks by it (location features are out of scope, CLAUDE.md section 1). Optional.
 * New cities go at the end, since Postgres adds enum values there; `CITY_REGIONS` sets the order
 * people see.
 */
export const CITIES = [
  'san-francisco',
  'seattle',
  'los-angeles',
  'chicago',
  'philadelphia',
  'new-york',
  'miami',
  'portland-or',
  'atlanta',
  'detroit',
  'new-orleans',
  'austin',
  'nashville',
  'london',
  'berlin',
  'amsterdam',
  'paris',
  'tokyo',
  'lisbon',
  'barcelona',
  'madrid',
] as const;
export const citySchema = z.enum(CITIES);
export type City = z.infer<typeof citySchema>;

export const CITY_LABELS: Record<City, string> = {
  'san-francisco': 'San Francisco',
  seattle: 'Seattle',
  'los-angeles': 'Los Angeles',
  chicago: 'Chicago',
  philadelphia: 'Philadelphia',
  'new-york': 'New York',
  miami: 'Miami',
  'portland-or': 'Portland, OR',
  atlanta: 'Atlanta',
  detroit: 'Detroit',
  'new-orleans': 'New Orleans',
  austin: 'Austin',
  nashville: 'Nashville',
  london: 'London',
  berlin: 'Berlin',
  amsterdam: 'Amsterdam',
  paris: 'Paris',
  tokyo: 'Tokyo',
  lisbon: 'Lisbon',
  barcelona: 'Barcelona',
  madrid: 'Madrid',
};

/** The city picker's groups, each alphabetical. Every city is in exactly one (tested). */
export const CITY_REGIONS: readonly { label: string; cities: readonly City[] }[] = [
  {
    label: 'North America',
    cities: [
      'atlanta',
      'austin',
      'chicago',
      'detroit',
      'los-angeles',
      'miami',
      'nashville',
      'new-orleans',
      'new-york',
      'philadelphia',
      'portland-or',
      'san-francisco',
      'seattle',
    ],
  },
  {
    label: 'Europe',
    cities: ['amsterdam', 'barcelona', 'berlin', 'lisbon', 'london', 'madrid', 'paris'],
  },
  { label: 'Asia', cities: ['tokyo'] },
];

/**
 * Words that can't be handles: the app's own sections (a handle names a page beside them), and
 * names that would read as speaking for the app.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'about',
  'admin',
  'api',
  'app',
  'discover',
  'feed',
  'feedback',
  'help',
  'listen',
  'me',
  'mod',
  'moderator',
  'notifications',
  'official',
  'playlists',
  'privacy',
  'profiles',
  'projects',
  'root',
  'security',
  'settings',
  'staff',
  'support',
  'system',
  'team',
  'terms',
  'tracks',
  'www',
]);

/**
 * A handle, the address of a public page (`/@handle`): 3 to 20 lowercase letters, digits, or
 * underscores, and not reserved (decided 2026-10-21). Typed in any case and kept lowercase.
 */
export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/)
  .refine((handle) => !RESERVED_HANDLES.has(handle), { message: 'That handle is reserved' });

/** What other people see a user called, e.g. on their comments. */
export const displayNameSchema = z.string().trim().min(1).max(50);
/** Empty (after trimming) is saved as no bio. */
const bioSchema = z.string().trim().max(500).nullable();

/**
 * `GET`/`PATCH /v1/me/profile`: the signed-in user's own profile, everything included. What
 * others see is `publicProfileResponseSchema`, and only once there's a handle.
 */
export const profileResponseSchema = z.object({
  /** Null until they pick one; defaults to null so a web build ahead of the API still reads this. */
  handle: z.string().nullable().default(null),
  displayName: z.string().nullable(),
  bio: z.string().nullable(),
  city: citySchema.nullable(),
  /**
   * The profile picture, as a short-lived signed URL (never log it). Defaults to null so a web
   * build ahead of the API (a preview deploy) still reads older responses.
   */
  avatar: coverImageSchema.nullable().default(null),
  /** The newest picture upload while it's processing or after it failed, so the page can say so. */
  avatarUpload: avatarResponseSchema.nullable().default(null),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

/** `PATCH /v1/me/profile`: only the fields sent change; null clears one. */
export const updateProfileRequestSchema = z.object({
  /** Null takes the public page down. A handle someone else has is a 409 `HANDLE_TAKEN`. */
  handle: handleSchema.nullable().optional(),
  displayName: displayNameSchema.nullable().optional(),
  bio: bioSchema.optional(),
  city: citySchema.nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

/** `/v1/profiles/:handle/...`: in any case; anything that isn't someone's handle is a 404. */
export const profileParamsSchema = z.object({ handle: z.string().max(64) });

/**
 * `GET /v1/profiles/:handle`: someone's public page, open to anyone. There's one only for an
 * approved account with a handle; their public tracks and projects are listed by
 * `/v1/profiles/:handle/tracks` and `/projects`.
 */
export const publicProfileResponseSchema = z.object({
  handle: z.string(),
  displayName: z.string().nullable(),
  bio: z.string().nullable(),
  city: citySchema.nullable(),
  /** A short-lived signed URL; never log it. */
  avatar: coverImageSchema.nullable(),
});
export type PublicProfileResponse = z.infer<typeof publicProfileResponseSchema>;
