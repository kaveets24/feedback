import { sql } from 'drizzle-orm';
import {
  check,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const ACCESS_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const accessStatus = pgEnum('access_status', ACCESS_STATUSES);

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
