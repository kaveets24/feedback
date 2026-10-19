import { z } from 'zod';

/** Where a project is at, set by the artist. Purely descriptive: it gates nothing. */
export const PROJECT_STATUSES = ['idea', 'demo', 'mixing', 'done'] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
