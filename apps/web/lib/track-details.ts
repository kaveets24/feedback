import type { ActionResult } from './action-result';

/** The fields of a track's edit form. A null genre or project means none. */
export type TrackDetails = { title: string; genre: string | null; projectId: string | null };

export type TrackDetailChanges = Partial<Pick<TrackDetails, 'title' | 'genre'>>;

/**
 * Saves what changed and nothing else, so a form left open doesn't undo a change made in another
 * tab. The title and genre go together; moving is a separate API call, so it can fail after they
 * saved, and the message then says so. Returns what went wrong, or null. A retry after that only
 * sends the move, since the saved fields now match.
 */
export async function saveTrackDetails(
  current: TrackDetails,
  next: TrackDetails,
  actions: {
    saveDetails: (changes: TrackDetailChanges) => Promise<ActionResult<unknown>>;
    moveToProject: () => Promise<{ message: string } | null>;
  },
): Promise<string | null> {
  const changes: TrackDetailChanges = {
    ...(next.title !== current.title && { title: next.title }),
    ...(next.genre !== current.genre && { genre: next.genre }),
  };
  const hasChanges = Object.keys(changes).length > 0;
  if (hasChanges) {
    const saved = await actions.saveDetails(changes);
    if (!saved.ok) return saved.message;
  }
  if (next.projectId !== current.projectId) {
    const failure = await actions.moveToProject();
    if (failure) {
      return hasChanges
        ? 'Your other changes are saved, but the track didn’t move. Reload the page and try again.'
        : failure.message;
    }
  }
  return null;
}
