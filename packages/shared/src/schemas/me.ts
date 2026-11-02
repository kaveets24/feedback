import { z } from 'zod';

export const ACCESS_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const accessStatusSchema = z.enum(ACCESS_STATUSES);
export type AccessStatus = z.infer<typeof accessStatusSchema>;

export const meResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  accessStatus: accessStatusSchema,
  profile: z
    .object({
      /** Null until handles get format rules (CLAUDE.md section 13). */
      handle: z.string().nullable(),
      displayName: z.string().nullable(),
      avatarUrl: z.string().nullable(),
    })
    .nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
