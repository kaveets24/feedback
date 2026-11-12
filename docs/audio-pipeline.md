# Audio pipeline

> How uploads become playable audio, cover art, and profile pictures, and how stuck uploads are cleaned up. Linked from [CLAUDE.md](../CLAUDE.md); keep it current when a decision changes.

```
Client                API                      B2/S3              Worker
  | POST /uploads       |                         |                  |
  |-------------------->| create version row      |                  |
  |   presigned PUT URL |  (status=uploading)     |                  |
  |<--------------------|                         |                  |
  | PUT file ----------------------------------->| (original, private)
  | POST /uploads/:id/complete                   |                  |
  |-------------------->| enqueue job ------------------------------>|
  |                     | status=processing       |  ffmpeg: AAC + peaks + duration
  |                     |<------------------------------------------| status=ready
```

- **Uploading on the web** (decided 2026-11-05): a dropped or chosen file opens one dialog (`apps/web/app/upload-dialog.tsx`) that asks for everything once, and nothing goes up until it's confirmed there, since a soft-deleted track keeps its files, so a wrong file sent straight away couldn't really be taken back. Cancelling mid-upload stops the transfer and leaves the rest to the cleanup below.
- `POST /v1/uploads` can also take a `projectId` (one of the artist's own, or a 404), `genre`, and `feedbackPrompt`, all saved with the track in one transaction, so nothing has to be entered twice. A track that joins a wider project this way stays private, through the same override as moving one in (rule 7). `POST /v1/tracks/:trackId/versions` takes `feedbackPrompt` beside `changeNotes` (decided 2026-11-05).
- Accepted inputs: mp3, wav, m4a, aac, flac, ogg. Enforce max size (start at 200 MB) and max duration (start at 20 min). Validate by sniffing, not only by extension.
- Output: AAC (m4a) stream file, plus waveform peaks (about 1000 points, normalized 0 to 1) and `duration_ms`.
- Originals live in a **private** bucket/prefix. Stream files likewise; both only reachable via signed URLs.
- Worker jobs must be **idempotent** and retry-safe. Failed jobs set `status=failed` with a user-visible reason.
- Uploads must never block the API process. No transcoding in request handlers.
- Start with progressive AAC. Move to HLS only if there's a concrete need.
- How the worker does it (`apps/worker/src/transcode/`): one ffmpeg pass writes the stream (192 kbps stereo AAC, resampled to 48 kHz only if higher, at `streams/<versionId>`) and pipes mono samples for the peaks and the exact duration (counted from decoded samples, since headers can lie). Peaks are absolute: each point is the loudest sample in its slice as a fraction of full scale, so a quiet demo draws as quiet and the player can scale it for display.
- ffmpeg treats originals as hostile: it may read only local files (no URLs, so a crafted playlist can't fetch anything) with only the demuxers for the accepted formats, keeps only the first audio stream, and drops all metadata (tags can hold things the artist didn't mean to share).
- A file that can't be used fails at once with a reason; any other error is retried (3 attempts, set by the API when it queues the job), and the last failed attempt marks the version failed and reports to Sentry.
- **Stuck uploads are cleaned up** by a sweep in the worker (`apps/worker/src/cleanup/`), every 15 minutes on a `maintenance` queue whose BullMQ job scheduler keeps one schedule however many workers run. Uploads (versions, covers, pictures) still `uploading` a day after they started are marked failed ("The upload didn't finish") and whatever reached storage of them is deleted; tracks whose every version was abandoned that way are soft-deleted like an owner's deletion. Uploads `processing` for over an hour are checked against their job: a missing one is queued again (the job id is the upload id, so it can't double up), and one that failed or completed without them (a worker killed mid-job until BullMQ gave up, which skips the last-attempt handling) is marked failed and reported to Sentry. A job still waiting or running is left alone. Every change is compare-and-set, and the job options are shared (`JOB_OPTIONS` in `packages/shared`), so a requeued job runs like the API's.
- **Cover art** uses the same flow on its own `cover` queue: the browser PUTs a JPEG, PNG, or WebP (up to 10 MB) to `cover-originals/<coverId>`, the API sniffs its bytes on complete, and the worker (`apps/worker/src/cover/`) re-encodes it with ffmpeg, with the same input guards (only the three image demuxers, only local files), refusing anything over 50 megapixels before decoding. ffmpeg applies EXIF orientation, centre-crops to a square, scales down to at most 1024px, and writes `covers/<coverId>.jpg` with no metadata at all (photo EXIF can hold GPS location), then deletes the original. Covers are served like audio: short-lived signed URLs (10 minutes) in project responses.
- **Profile pictures** go through the same steps on an `avatar` queue (`avatar-originals/<avatarId>` in, `avatars/<avatarId>.jpg` out, at most 512px), with the same image job in `apps/worker/src/cover/`. Only the user's own profile response carries the signed URL for now; others will see it next to comments.
