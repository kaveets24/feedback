# 0004: Postgres 18 everywhere

- **Status:** accepted
- **Date:** 2026-10-12

## Context

CLAUDE.md said Postgres 16 from the first scaffold, but that was never a weighed decision, just
the version written into the original spec. Local dev and CI ran 16. The staging Neon project
was created on 18 (Neon's default for new projects), and a Neon project's major version is set
when it's created. Staging should run the same major version as dev and CI, so a migration
that passes CI behaves the same on staging.

## Decision

Use **Postgres 18** for local dev (docker-compose), CI service containers, staging (Neon), and
production when it exists.

Why 18 rather than recreating the Neon project on 16:

- **Support window.** Each major gets five years of fixes: 16 ends November 2028, 18 ends
  November 2030. Starting on 18 puts the first major upgrade years further out.
- **Native `uuidv7()`.** Our IDs are UUIDv7 (CLAUDE.md section 5). Today the app generates them
  with the `uuid` package; 18 can generate them in the database if we ever want that (not changed
  here).
- **Performance.** 18 adds asynchronous I/O (faster sequential scans, bitmap heap scans and
  vacuum) and skip scan for multicolumn B-tree indexes. Our workload is small indexed lookups, so
  expect modest gains rather than dramatic ones, and Neon's storage layer differs from a local
  disk. This is a bonus, not the reason.
- No dependency needed changes: postgres.js, Drizzle and pgweb work on 18 and the full test suite
  passes.

## Consequences

- The official 18 image stores data in a versioned subdirectory and refuses to start on a volume
  mounted the old way (`/var/lib/postgresql/data`) or one holding data from an older major. The
  compose volume is now `postgres-18-data`, mounted at `/var/lib/postgresql`. After pulling this
  change, run `pnpm services:up && pnpm db:migrate && pnpm db:seed`. The old `postgres-data`
  volume is left untouched and can be deleted.
- Future major upgrades follow the same pattern: bump the image, rename the volume, recreate
  local data, and move the hosted databases to the new major.
