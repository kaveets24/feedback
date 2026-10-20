import { z } from 'zod';

/**
 * The cities a profile can name. Only a label the user picks for themselves: nothing filters,
 * sorts, or ranks by it (location features are out of scope, CLAUDE.md section 1). Optional.
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
};

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
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

/** `PATCH /v1/me/profile`: only the fields sent change; null clears one. */
export const updateProfileRequestSchema = z.object({
  displayName: displayNameSchema.nullable().optional(),
  bio: bioSchema.optional(),
  city: citySchema.nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
