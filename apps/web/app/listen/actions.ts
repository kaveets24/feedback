'use server';

import {
  ApiError,
  shareTokenSchema,
  type ProjectDetailResponse,
  type TrackResponse,
} from '@feedback/shared';
import { sharedApi } from '../../lib/api';

/** What a share link opens, as the listen page shows it. */
export type Shared =
  | { kind: 'track'; track: TrackResponse }
  | { kind: 'project'; project: ProjectDetailResponse; tracks: TrackResponse[] };

/**
 * Opens a share link: what it's for, loaded through the API with only the link's token (never the
 * visitor's session), so the API shows what any listener would see. Null when the link doesn't
 * work, whatever the reason: revoked, expired, made private, or never real.
 */
export async function openShareAction(token: unknown): Promise<Shared | null> {
  const parsed = shareTokenSchema.safeParse(token);
  if (!parsed.success) return null;
  const api = sharedApi(parsed.data);
  try {
    const { resourceType, resourceId } = await api.getSharedResource();
    if (resourceType === 'track') {
      return { kind: 'track', track: await api.getTrack(resourceId) };
    }
    const [project, { tracks }] = await Promise.all([
      api.getProject(resourceId),
      api.listProjectTracks(resourceId),
    ]);
    // The list has no waveforms; each track's own response does. Projects hold tens of tracks.
    const full = await Promise.all(tracks.map((t) => api.getTrack(t.id)));
    return { kind: 'project', project, tracks: full };
  } catch (err) {
    // A link that stops working partway (revoked between calls) reads the same as a dead one.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
