import { z } from 'zod';
import { coverImageSchema, coverResponseSchema } from './covers.ts';
import { trackSummarySchema, visibilitySchema } from './tracks.ts';

/** Where a project is at, set by the artist. Purely descriptive: it gates nothing. */
export const PROJECT_STATUSES = ['idea', 'demo', 'mixing', 'done'] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

const titleSchema = z.string().trim().min(1).max(200);
/** Empty (after trimming) is saved as no description. */
const descriptionSchema = z.string().trim().max(2000).nullable();

/** `POST /v1/projects`. New projects are private (CLAUDE.md section 6, rule 1). */
export const createProjectRequestSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.optional(),
  status: projectStatusSchema.optional(),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

/**
 * `PATCH /v1/projects/:projectId`: only the fields sent change; `description: null` clears it.
 * `visibility` also changes who can hear the project's tracks that follow it.
 */
export const updateProjectRequestSchema = z.object({
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  status: projectStatusSchema.optional(),
  visibility: visibilitySchema.optional(),
});
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

export const projectResponseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  visibility: visibilitySchema,
  /** The cover art, or null when there's none. */
  cover: coverImageSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

/**
 * `GET /v1/projects/:projectId`: the project, plus its newest cover upload while that one is
 * still processing or after it failed (null otherwise, including once it's the cover, and always
 * for anyone but the owner).
 */
export const projectDetailResponseSchema = projectResponseSchema.extend({
  coverUpload: coverResponseSchema.nullable(),
});
export type ProjectDetailResponse = z.infer<typeof projectDetailResponseSchema>;

export const PROJECT_LIST_DEFAULT_LIMIT = 50;
export const PROJECT_LIST_MAX_LIMIT = 100;

export const projectListQuerySchema = z.object({
  /** `nextCursor` from the previous page; omit for the first. Treat it as opaque. */
  cursor: z.uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PROJECT_LIST_MAX_LIMIT)
    .default(PROJECT_LIST_DEFAULT_LIMIT),
});
export type ProjectListQuery = z.input<typeof projectListQuerySchema>;

/** Newest first. `nextCursor` is null on the last page. */
export const projectListResponseSchema = z.object({
  projects: z.array(projectResponseSchema),
  nextCursor: z.string().nullable(),
});
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

export const projectParamsSchema = z.object({ projectId: z.uuid() });

export const projectTrackParamsSchema = z.object({ projectId: z.uuid(), trackId: z.uuid() });

/**
 * `POST /v1/projects/:projectId/tracks`: adds one of your tracks to the end of the project. A
 * track in another project moves here; one already here stays where it is.
 */
export const addProjectTrackRequestSchema = z.object({ trackId: z.uuid() });
export type AddProjectTrackRequest = z.infer<typeof addProjectTrackRequestSchema>;

/**
 * `PUT /v1/projects/:projectId/tracks`: the project's tracks in their new order. It must name
 * every track in the project exactly once, as last loaded; otherwise it's a 409 and nothing
 * changes, so two edits at once can't scramble the order.
 */
export const reorderProjectTracksRequestSchema = z.object({ trackIds: z.array(z.uuid()) });
export type ReorderProjectTracksRequest = z.infer<typeof reorderProjectTracksRequestSchema>;

/** A project's tracks in order. Projects hold tens of tracks, so this isn't paged. */
export const projectTracksResponseSchema = z.object({ tracks: z.array(trackSummarySchema) });
export type ProjectTracksResponse = z.infer<typeof projectTracksResponseSchema>;
