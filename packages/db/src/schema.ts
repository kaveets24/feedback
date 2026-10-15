import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { VISIBILITIES } from '@feedback/authz';
import { ACCESS_STATUSES, VERSION_STATUSES } from '@feedback/shared';

export const accessStatus = pgEnum('access_status', ACCESS_STATUSES);
export const visibility = pgEnum('visibility', VISIBILITIES);
export const trackVersionStatus = pgEnum('track_version_status', VERSION_STATUSES);

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
 * A song. Tracks belong to their owner directly; `project_id` (nullable, a "loose" track has
 * none) arrives with the projects table in Phase 3.
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
    title: text('title').notNull(),
    notes: text('notes'),
    visibility: visibility('visibility').notNull().default('private'),
    /** Newest `ready` version; one still processing or failed never replaces it. */
    currentVersionId: uuid('current_version_id').references((): AnyPgColumn => trackVersions.id, {
      onDelete: 'set null',
    }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('tracks_owner_id_created_at_idx').on(t.ownerId, t.createdAt)],
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
