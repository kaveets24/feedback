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

/** What other people see a user called, e.g. on their comments. */
export const displayNameSchema = z.string().trim().min(1).max(50);
/** Empty (after trimming) is saved as no bio. */
const bioSchema = z.string().trim().max(500).nullable();

/**
 * `GET`/`PATCH /v1/me/profile`: the signed-in user's own profile. Only they see it; others see
 * only the display name.
 */
export const profileResponseSchema = z.object({
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
  displayName: displayNameSchema.nullable().optional(),
  bio: bioSchema.optional(),
  city: citySchema.nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
