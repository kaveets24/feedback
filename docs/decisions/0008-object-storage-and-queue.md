# 0008: Object storage on Backblaze B2, SeaweedFS locally, Redis on Fly

- **Status:** accepted (replaces R2 in [0003](0003-staging-hosting-and-monitoring.md) and CLAUDE.md)
- **Date:** 2026-10-13

## Context

Phase 2 adds uploads: the browser uploads originals straight to object storage with presigned
URLs, the worker transcodes them, and players stream the result through short-lived signed URLs.
CLAUDE.md planned Cloudflare R2 for staging and production, MinIO as the local stand-in, and Redis
with BullMQ for jobs.

MinIO no longer publishes free images, so local dev and CI need another S3-compatible server.
Staging also needs Redis before the first queue lands.

## Decision

**Backblaze B2 for staging and production, instead of R2.** Both have 10 GB free and speak the
S3 API. They price differently:

|                  | R2              | B2                                                     |
| ---------------- | --------------- | ------------------------------------------------------ |
| Storage          | $0.015/GB-month | about $0.007/GB-month                                  |
| Egress (streams) | free            | free up to 3x the data stored per month, then $0.01/GB |

B2 is cheaper while monthly egress stays under about 3.8x what's stored. This app is
storage-heavy and play-light: every version and its original is kept, and most tracks are
private with a handful of listeners who move on to the next version. A 3.5-minute song is about
4 MB as a stream and 10 to 40 MB as an original, so B2 stays cheaper until the average version is
played about 12 to 38 times a month. B2 also has daily caps on storage, egress, and transactions,
which we set so a bill can't run away. Cloudflare's free egress from B2 doesn't apply: our audio is
private and served through signed URLs, not a public bucket behind a CDN.

**SeaweedFS as the local and CI stand-in** (`chrislusf/seaweedfs`, Apache 2.0), one container in
`docker-compose.yml` running `weed server -s3`. A trial before choosing it confirmed what we rely
on:

- a presigned PUT with `Content-Length` and `Content-Type` signed in accepts exactly that file and
  rejects a different size or type (403);
- presigned GETs serve byte ranges (206) and reject unsigned, tampered, and expired requests;
- bucket CORS (`PutBucketCors`) allows the configured origin and refuses others.

Garage was the fallback; it wasn't needed. CI starts the same compose service, so tests run against
the same image and config as local dev.

**Storage layout and rules** (in `packages/storage`):

- One private bucket per environment. Originals and stream files live under `originals/` and
  `streams/` prefixes, keyed by version id. Nothing is ever public.
- Uploads use presigned **PUT** with the exact size and type signed in; B2 (like R2) doesn't
  support presigned POST, so this is how the size limit is enforced. The API also checks the
  stored size when the upload is completed.
- Presigned URLs live at most 15 minutes (CLAUDE.md section 6, rule 5): 15 for uploads, 10 for
  playback. They're bearer credentials and are never logged.
- The S3 client sends checksums only when an operation requires them. The SDK's default signs a
  CRC32 of the empty body into presigned PUT URLs, which makes every real upload fail with
  `BadDigest` on SeaweedFS (B2 and R2 document the same issue).
- Path-style URLs (`endpoint/bucket/key`), which both SeaweedFS and B2 accept.
- CORS on the bucket allows `GET`, `HEAD`, and `PUT` from the web origin only.

**Redis and BullMQ for jobs, as planned.** Locally, Redis is already in `docker-compose.yml`. On
staging it runs as its own small Fly app with a volume, reachable only over Fly's private network,
with a password and `maxmemory-policy noeviction` (BullMQ requires it). That costs about $2 a
month; Upstash was the alternative, but BullMQ's constant polling adds up on per-command pricing.

## Consequences

- Staging storage is free under 10 GB. B2 and Redis on Fly are two more pieces to set up for
  staging (documented in `docs/staging.md` when the upload API needs them).
- Everything goes through the S3 API, so moving to R2 later is a change of endpoint and keys, plus
  copying the objects.
- Revisit B2 if egress approaches 3.8x stored data, for example once public tracks get lots of
  plays. Revisit hosting Redis ourselves if it needs more care than a small Fly app.
- Developers need the storage container running for storage tests, like Postgres for DB tests
  (`pnpm services:up` starts both).
