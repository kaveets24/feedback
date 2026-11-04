import { describe, expect, it, vi } from 'vitest';
import { saveTrackDetails, type TrackDetails } from './track-details';

const current: TrackDetails = { title: 'Idea', genre: 'grime', projectId: 'project-a' };

function setup({
  saved = { ok: true as const, data: null },
  moved = null,
}: {
  saved?: { ok: true; data: null } | { ok: false; message: string };
  moved?: { message: string } | null;
} = {}) {
  return {
    saveDetails: vi.fn(async () => saved),
    moveToProject: vi.fn(async () => moved),
  };
}

describe('saveTrackDetails', () => {
  it('calls nothing when nothing changed', async () => {
    const actions = setup();
    await expect(saveTrackDetails(current, { ...current }, actions)).resolves.toBeNull();
    expect(actions.saveDetails).not.toHaveBeenCalled();
    expect(actions.moveToProject).not.toHaveBeenCalled();
  });

  it('sends only the fields that changed', async () => {
    const actions = setup();
    await saveTrackDetails(current, { ...current, title: 'Night drive' }, actions);
    expect(actions.saveDetails).toHaveBeenCalledWith({ title: 'Night drive' });
    expect(actions.moveToProject).not.toHaveBeenCalled();

    const clearing = setup();
    await saveTrackDetails(current, { ...current, genre: null }, clearing);
    expect(clearing.saveDetails).toHaveBeenCalledWith({ genre: null });
  });

  it('only moves when only the project changed, including out of a project', async () => {
    const actions = setup();
    await expect(
      saveTrackDetails(current, { ...current, projectId: null }, actions),
    ).resolves.toBeNull();
    expect(actions.saveDetails).not.toHaveBeenCalled();
    expect(actions.moveToProject).toHaveBeenCalledOnce();
  });

  it('saves the details before moving', async () => {
    const order: string[] = [];
    await saveTrackDetails(
      current,
      { title: 'Night drive', genre: 'bass', projectId: 'project-b' },
      {
        saveDetails: async (changes) => {
          order.push(`save ${JSON.stringify(changes)}`);
          return { ok: true, data: null };
        },
        moveToProject: async () => {
          order.push('move');
          return null;
        },
      },
    );
    expect(order).toEqual(['save {"title":"Night drive","genre":"bass"}', 'move']);
  });

  it("doesn't move when the details can't be saved", async () => {
    const actions = setup({ saved: { ok: false, message: 'Give the track a title.' } });
    await expect(
      saveTrackDetails(current, { title: '', genre: 'grime', projectId: 'project-b' }, actions),
    ).resolves.toBe('Give the track a title.');
    expect(actions.moveToProject).not.toHaveBeenCalled();
  });

  it('says what was saved when only the move fails', async () => {
    const actions = setup({ moved: { message: 'The project changed.' } });
    await expect(
      saveTrackDetails(current, { ...current, title: 'New', projectId: 'project-b' }, actions),
    ).resolves.toBe(
      'Your other changes are saved, but the track didn’t move. Reload the page and try again.',
    );
  });

  it('reports a failed move as is when nothing else changed', async () => {
    const actions = setup({ moved: { message: 'The project changed.' } });
    await expect(
      saveTrackDetails(current, { ...current, projectId: 'project-b' }, actions),
    ).resolves.toBe('The project changed.');
  });
});
