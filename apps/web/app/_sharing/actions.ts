'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { linkRoleSchema, visibilitySchema, type CreateShareLinkResponse } from '@feedback/shared';
import { toResult, type ActionResult } from '../../lib/action-result';
import { serverApi } from '../../lib/api';
import { EXPIRY_CHOICES, expiresAtFor } from '../../lib/share';

// The sharing settings' calls to the API, as the signed-in owner. Server actions are public
// endpoints, so input is checked here as well as by the API.

const target = z.object({ kind: z.enum(['track', 'project']), id: z.uuid() });
type Target = z.infer<typeof target>;

function revalidate({ kind, id }: Target) {
  if (kind === 'track') {
    revalidatePath(`/tracks/${id}`);
  } else {
    // A project's visibility reaches the tracks that follow it.
    revalidatePath(`/projects/${id}`);
    revalidatePath('/tracks/[trackId]', 'page');
  }
}

/**
 * Sets who can listen. For a track in a project, null follows the project again; a project
 * always has its own.
 */
export async function setVisibilityAction(
  to: unknown,
  setting: unknown,
): Promise<ActionResult<null>> {
  const parsedTarget = target.safeParse(to);
  const parsed = visibilitySchema.nullable().safeParse(setting);
  if (!parsedTarget.success || !parsed.success) return { ok: false, message: 'Unknown setting.' };
  const { kind, id } = parsedTarget.data;
  const visibility = parsed.data;
  const api = serverApi();
  let result;
  if (kind === 'track') {
    result = await toResult(() => api.updateTrack(id, { visibility }));
  } else if (visibility) {
    result = await toResult(() => api.updateProject(id, { visibility }));
  } else {
    return { ok: false, message: 'A project has no project to follow.' };
  }
  if (!result.ok) return { ok: false, message: "Couldn't save. Reload the page and try again." };
  revalidate(parsedTarget.data);
  return { ok: true, data: null };
}

const createInput = z.object({
  role: linkRoleSchema,
  expiry: z.enum(EXPIRY_CHOICES),
  /** Also lets link holders in, for something that's private (where links do nothing). */
  allowLinkAccess: z.boolean(),
});

/** Makes a share link. The token comes back once, here, for the owner to copy. */
export async function createShareLinkAction(
  to: unknown,
  input: unknown,
): Promise<ActionResult<CreateShareLinkResponse>> {
  const parsedTarget = target.safeParse(to);
  const parsed = createInput.safeParse(input);
  if (!parsedTarget.success || !parsed.success) return { ok: false, message: 'Unknown setting.' };
  const { kind, id } = parsedTarget.data;
  const { role, expiry, allowLinkAccess } = parsed.data;
  const api = serverApi();

  if (allowLinkAccess) {
    const opened =
      kind === 'track'
        ? await toResult(() => api.updateTrack(id, { visibility: 'unlisted' }))
        : await toResult(() => api.updateProject(id, { visibility: 'unlisted' }));
    if (!opened.ok) {
      return { ok: false, message: "Couldn't make the link. Reload the page and try again." };
    }
  }
  const body = { role, expiresAt: expiresAtFor(expiry, new Date()) };
  const result = await toResult(() =>
    kind === 'track' ? api.createTrackShareLink(id, body) : api.createProjectShareLink(id, body),
  );
  revalidate(parsedTarget.data);
  if (!result.ok) {
    return { ok: false, message: "Couldn't make the link. Reload the page and try again." };
  }
  return result;
}

/** Turns a link off at once. */
export async function revokeShareLinkAction(
  to: unknown,
  linkId: unknown,
): Promise<ActionResult<null>> {
  const parsedTarget = target.safeParse(to);
  const parsedId = z.uuid().safeParse(linkId);
  if (!parsedTarget.success || !parsedId.success) return { ok: false, message: 'Unknown link.' };
  const result = await toResult(() => serverApi().revokeShareLink(parsedId.data));
  if (!result.ok) {
    return { ok: false, message: "Couldn't turn the link off. Reload the page and try again." };
  }
  revalidate(parsedTarget.data);
  return { ok: true, data: null };
}
