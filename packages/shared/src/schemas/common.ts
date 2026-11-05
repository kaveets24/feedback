import { z } from 'zod';

/** Carries the secret shared by the web app and the API, which vouches for the next header. */
export const WEB_SECRET_HEADER = 'x-web-secret';
/** The visitor's address, as the web app saw it; the API only believes it with the secret. */
export const CLIENT_IP_HEADER = 'x-client-ip';

/** Consistent error shape returned by every API endpoint. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
