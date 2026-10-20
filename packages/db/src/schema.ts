import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { VISIBILITIES } from '@feedback/authz';
import { ACCESS_STATUSES, PROJECT_STATUSES, VERSION_STATUSES } from '@feedback/shared';

export const accessStatus = pgEnum('access_status', ACCESS_STATUSES);
export const visibility = pgEnum('visibility', VISIBILITIES);
export const projectStatus = pgEnum('project_status', PROJECT_STATUSES);
export const trackVersionStatus = pgEnum('track_version_status', VERSION_STATUSES);
/** A cover upload goes through the same lifecycle as a version: uploading, processing, ready or failed. */
export const coverStatus = pgEnum('cover_status', VERSION_STATUSES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  authProviderId: text('auth_provider_id').notNull().unique(),
  email: text('email').notNull().unique(),
  accessStatus: accessStatus('access_status').notNull().default('pending'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: uuid('approved_by').references((): AnyPgColumn => users.id, {
    onDelete: 'set null',
  }),
  ...timestamps,
});

export type User = typeof users.$inferSelect;

export interface ProfileLink {
  label: string;
  url: string;
}

export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    handle: text('handle').notNull().unique(),
    displayName: text('display_name'),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    links: jsonb('links').$type<ProfileLink[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [check('profiles_handle_lowercase', sql`${t.handle} = lower(${t.handle})`)],
);

export type Profile = typeof profiles.$inferSelect;

/**
 * An artist's own body of work (album, EP, idea folder). Projects are only soft-deleted; deleting
 * one leaves its tracks loose rather than deleting them.
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: projectStatus('status').notNull().default('idea'),
    visibility: visibility('visibility').notNull().default('private'),
    /** The newest `ready` cover; one still processing or failed never replaces it. */
    currentCoverId: uuid('current_cover_id').references((): AnyPgColumn => projectCovers.id, {
      onDelete: 'set null',
    }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('projects_owner_id_id_idx').on(t.ownerId, t.id),
    // Target of the tracks foreign key below, which keeps a track in its own owner's projects.
    unique('projects_id_owner_id_unique').on(t.id, t.ownerId),
  ],
);

export type Project = typeof projects.$inferSelect;

/**
 * A song. A track with no `project_id` is "loose". A track in a project has a `position` there
 * (sorted ascending; gaps are fine) and always shares the project's owner.
 */
export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    position: integer('position'),
    title: text('title').notNull(),
    notes: text('notes'),
    /** A loose track's own visibility. */
    visibility: visibility('visibility').notNull().default('private'),
    /**
     * Per-track override of the project's visibility. How it combines with the project's is
     * settled in Phase 4 (CLAUDE.md section 6, rule 7); until then nothing reads it.
     */
    visibilityOverride: visibility('visibility_override'),
    /** Newest `ready` version; one still processing or failed never replaces it. */
    currentVersionId: uuid('current_version_id').references((): AnyPgColumn => trackVersions.id, {
      onDelete: 'set null',
    }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('tracks_owner_id_created_at_idx').on(t.ownerId, t.createdAt),
    index('tracks_project_id_position_idx').on(t.projectId, t.position),
    // Includes owner_id so a track can only join a project with the same owner. Not unique on
    // position: a reorder rewrites positions row by row, which a plain unique index would trip
    // over mid-statement; the query helpers keep positions distinct under a project row lock.
    foreignKey({
      name: 'tracks_project_owner_fk',
      columns: [t.projectId, t.ownerId],
      foreignColumns: [projects.id, projects.ownerId],
    }),
    check('tracks_position_iff_project', sql`(${t.projectId} is null) = (${t.position} is null)`),
    check('tracks_position_non_negative', sql`${t.position} >= 0`),
  ],
);

export type Track = typeof tracks.$inferSelect;

/**
 * One uploaded file of a track. Immutable once `ready`; edits are a new version. Version numbers
 * count up per track and are never reused, even when a version fails.
 */
export const trackVersions = pgTable(
  'track_versions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    changeNotes: text('change_notes'),
    /** What the artist wants feedback on. */
    feedbackPrompt: text('feedback_prompt'),
    status: trackVersionStatus('status').notNull().default('uploading'),
    /** Shown to the artist when status is `failed`. */
    failureReason: text('failure_reason'),
    originalKey: text('original_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    originalContentType: text('original_content_type').notNull(),
    originalSizeBytes: bigint('original_size_bytes', { mode: 'number' }).notNull(),
    streamKey: text('stream_key'),
    durationMs: integer('duration_ms'),
    /** About 1000 points, normalized 0 to 1. */
    waveformPeaks: jsonb('waveform_peaks').$type<number[]>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('track_versions_track_id_version_number_idx').on(t.trackId, t.versionNumber),
    check('track_versions_version_number_positive', sql`${t.versionNumber} >= 1`),
    check(
      'track_versions_ready_has_outputs',
      sql`${t.status} <> 'ready' or (${t.streamKey} is not null and ${t.durationMs} is not null and ${t.waveformPeaks} is not null)`,
    ),
    check(
      'track_versions_failed_has_reason',
      sql`${t.status} <> 'failed' or ${t.failureReason} is not null`,
    ),
  ],
);

export type TrackVersion = typeof trackVersions.$inferSelect;

/**
 * A cover art upload for a project. The original is never shown: the worker re-encodes it into a
 * square JPEG with every bit of metadata dropped (photo EXIF can hold GPS location), stores that at
 * `cover_key`, and deletes the original.
 */
export const projectCovers = pgTable(
  'project_covers',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: coverStatus('status').notNull().default('uploading'),
    /** Shown to the artist when status is `failed`. */
    failureReason: text('failure_reason'),
    originalKey: text('original_key').notNull(),
    originalContentType: text('original_content_type').notNull(),
    originalSizeBytes: bigint('original_size_bytes', { mode: 'number' }).notNull(),
    /** The re-encoded JPEG, once `ready`. */
    coverKey: text('cover_key'),
    ...timestamps,
  },
  (t) => [
    index('project_covers_project_id_id_idx').on(t.projectId, t.id),
    check(
      'project_covers_ready_has_cover',
      sql`${t.status} <> 'ready' or ${t.coverKey} is not null`,
    ),
    check(
      'project_covers_failed_has_reason',
      sql`${t.status} <> 'failed' or ${t.failureReason} is not null`,
    ),
  ],
);

export type ProjectCover = typeof projectCovers.$inferSelect;
