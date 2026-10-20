import { coverKeys, latestCover, type Db, type Project, type ProjectCover } from '@feedback/db';
import type { CoverImage, CoverResponse } from '@feedback/shared';
import type { Storage } from '@feedback/storage';

/**
 * How long a cover's signed URL lives (CLAUDE.md section 6, rule 5: 5 to 15 minutes). A page
 * loads the image right away, and the browser keeps it after the URL expires.
 */
export const COVER_URL_SECONDS = 10 * 60;

export interface CoverDeps {
  db: Db;
  storage: Storage;
}

/**
 * Signed URLs for these projects' covers, by project id. Callers pass only projects the actor may
 * view; covers are never public, so every URL is short-lived (CLAUDE.md section 6, rule 5).
 */
export async function coverImages(
  { db, storage }: CoverDeps,
  projects: Project[],
): Promise<Map<string, CoverImage>> {
  const keys = await coverKeys(
    db,
    projects.flatMap((p) => (p.currentCoverId ? [p.currentCoverId] : [])),
  );
  const expiresAt = new Date(Date.now() + COVER_URL_SECONDS * 1000).toISOString();
  const images = await Promise.all(
    projects.map(async (project): Promise<[string, CoverImage] | null> => {
      const key = project.currentCoverId && keys.get(project.currentCoverId);
      if (!key) return null;
      const url = await storage.presignDownload({ key, expiresIn: COVER_URL_SECONDS });
      return [project.id, { url, expiresAt }];
    }),
  );
  return new Map(images.flatMap((entry) => (entry ? [entry] : [])));
}

export function toCoverResponse(cover: ProjectCover): CoverResponse {
  return { id: cover.id, status: cover.status, failureReason: cover.failureReason };
}

/**
 * The project's newest cover upload while it's still processing or after it failed, so the page
 * can say so. Null once it's the cover, and for an upload whose file never arrived.
 */
export async function pendingCoverUpload(db: Db, project: Project): Promise<CoverResponse | null> {
  const latest = await latestCover(db, project.id);
  if (!latest || latest.id === project.currentCoverId) return null;
  if (latest.status !== 'processing' && latest.status !== 'failed') return null;
  return toCoverResponse(latest);
}
