import { z } from 'zod';
import {
  avatarResponseSchema,
  createAvatarResponseSchema,
  type CreateAvatarRequest,
} from './schemas/avatars.ts';
import { errorResponseSchema } from './schemas/common.ts';
import {
  feedbackListResponseSchema,
  feedbackThreadSchema,
  type CreateFeedbackRequest,
  type CreateReplyRequest,
  type UpdateFeedbackRequest,
} from './schemas/feedback.ts';
import {
  coverResponseSchema,
  createCoverResponseSchema,
  type CreateCoverRequest,
} from './schemas/covers.ts';
import {
  feedResponseSchema,
  followingResponseSchema,
  type FollowListQuery,
} from './schemas/follows.ts';
import { meResponseSchema } from './schemas/me.ts';
import {
  notificationListResponseSchema,
  unreadCountResponseSchema,
  type NotificationListQuery,
} from './schemas/notifications.ts';
import {
  profileResponseSchema,
  publicProfileResponseSchema,
  type UpdateProfileRequest,
} from './schemas/profiles.ts';
import {
  createShareLinkResponseSchema,
  SHARE_TOKEN_HEADER,
  shareLinkListResponseSchema,
  sharedResourceResponseSchema,
  type CreateShareLinkRequest,
} from './schemas/share-links.ts';
import {
  projectDetailResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
  projectTracksResponseSchema,
  type CreateProjectRequest,
  type ProjectListQuery,
  type UpdateProjectRequest,
} from './schemas/projects.ts';
import {
  streamResponseSchema,
  trackListResponseSchema,
  trackResponseSchema,
  versionResponseSchema,
  type TrackListQuery,
  type UpdateTrackRequest,
  type UpdateVersionRequest,
} from './schemas/tracks.ts';
import {
  createUploadResponseSchema,
  type CreateUploadRequest,
  type CreateVersionRequest,
} from './schemas/uploads.ts';

/** A non-2xx API response, carrying the standard error body. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current session token, or null when signed out. */
  getToken?: () => Promise<string | null>;
  /** A share link's token, sent with every request so the API opens what the link is for. */
  shareToken?: string;
  fetch?: typeof fetch;
}

/** Typed client for the HTTP API. Every response is validated against its zod schema. */
export function createApiClient({
  baseUrl,
  getToken,
  shareToken,
  fetch = globalThis.fetch,
}: ApiClientOptions) {
  async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    const token = await getToken?.();
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (shareToken) headers.set(SHARE_TOKEN_HEADER, shareToken);

    const res = await fetch(new URL(path, baseUrl), { ...init, headers });
    const body: unknown = res.status === 204 ? undefined : await res.json().catch(() => null);

    if (!res.ok) {
      const parsed = errorResponseSchema.safeParse(body);
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new ApiError(res.status, code, message, details);
      }
      throw new ApiError(res.status, 'UNKNOWN_ERROR', `Request failed with status ${res.status}`);
    }
    return schema.parse(body);
  }

  const send = <T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown) =>
    request(path, schema, {
      method,
      ...(body !== undefined && {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
  const post = <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    send('POST', path, schema, body);

  const pageQuery = ({ cursor, limit }: TrackListQuery | ProjectListQuery | FollowListQuery) => {
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    if (limit !== undefined) query.set('limit', String(limit));
    return query.size ? `?${query}` : '';
  };

  return {
    getMe: () => request('/v1/me', meResponseSchema),
    /** The signed-in user's own profile; empty fields until they first save it. */
    getProfile: () => request('/v1/me/profile', profileResponseSchema),
    /** Changes the signed-in user's profile (null clears a field), creating it on first save. */
    updateProfile: (changes: UpdateProfileRequest) =>
      send('PATCH', '/v1/me/profile', profileResponseSchema, changes),
    /** Someone's public page, by handle (any case); a 404 if there's none. */
    getPublicProfile: (handle: string) =>
      request(`/v1/profiles/${encodeURIComponent(handle)}`, publicProfileResponseSchema),
    /** Someone's public tracks, newest first. Pass `nextCursor` back as `cursor` for more. */
    listProfileTracks: (handle: string, query: TrackListQuery = {}) =>
      request(
        `/v1/profiles/${encodeURIComponent(handle)}/tracks${pageQuery(query)}`,
        trackListResponseSchema,
      ),
    /** Someone's public projects, newest first. Pass `nextCursor` back as `cursor` for more. */
    listProfileProjects: (handle: string, query: ProjectListQuery = {}) =>
      request(
        `/v1/profiles/${encodeURIComponent(handle)}/projects${pageQuery(query)}`,
        projectListResponseSchema,
      ),
    /** Follows someone with a public page; following them again changes nothing. */
    followProfile: (handle: string) =>
      send('PUT', `/v1/profiles/${encodeURIComponent(handle)}/follow`, z.undefined()),
    unfollowProfile: (handle: string) =>
      send('DELETE', `/v1/profiles/${encodeURIComponent(handle)}/follow`, z.undefined()),
    /** Who the signed-in user follows, most recent first. */
    listFollowing: (query: FollowListQuery = {}) =>
      request(`/v1/me/following${pageQuery(query)}`, followingResponseSchema),
    /** New public work by the people the signed-in user follows, newest first. */
    getFeed: (query: FollowListQuery = {}) =>
      request(`/v1/feed${pageQuery(query)}`, feedResponseSchema),
    /** Starts uploading a profile picture; PUT the image to `upload`, then `completeAvatarUpload`. */
    startAvatarUpload: (input: CreateAvatarRequest) =>
      post('/v1/me/avatars', createAvatarResponseSchema, input),
    /** Call once the PUT succeeds. Safe to repeat; returns the picture upload's state. */
    completeAvatarUpload: (avatarId: string) =>
      post(`/v1/me/avatars/${encodeURIComponent(avatarId)}/complete`, avatarResponseSchema),
    /** A picture upload's state, to poll while it processes. */
    getAvatar: (avatarId: string) =>
      request(`/v1/me/avatars/${encodeURIComponent(avatarId)}`, avatarResponseSchema),
    /** Takes the signed-in user's profile picture off. */
    removeAvatar: () => send('DELETE', '/v1/me/avatar', z.undefined()),
    /** Starts an upload: creates the track and its v1, and returns where to PUT the file. */
    createUpload: (input: CreateUploadRequest) =>
      post('/v1/uploads', createUploadResponseSchema, input),
    /** Call once the PUT succeeds. Safe to repeat; returns the version's state. */
    completeUpload: (versionId: string) =>
      post(`/v1/uploads/${encodeURIComponent(versionId)}/complete`, versionResponseSchema),
    /** Starts uploading a track's next version; finish it with `completeUpload`, as for v1. */
    createVersion: (trackId: string, input: CreateVersionRequest) =>
      post(`/v1/tracks/${encodeURIComponent(trackId)}/versions`, createUploadResponseSchema, input),
    /** Changes a version's notes (null clears them). */
    updateVersion: (versionId: string, changes: UpdateVersionRequest) =>
      send(
        'PATCH',
        `/v1/versions/${encodeURIComponent(versionId)}`,
        versionResponseSchema,
        changes,
      ),
    getVersion: (versionId: string) =>
      request(`/v1/versions/${encodeURIComponent(versionId)}`, versionResponseSchema),
    /** A short-lived URL for a ready version's audio. Fetch a new one when it expires. */
    getStream: (versionId: string) =>
      request(`/v1/versions/${encodeURIComponent(versionId)}/stream`, streamResponseSchema),
    /** The signed-in user's tracks, newest first. Pass `nextCursor` back as `cursor` for more. */
    listTracks: (query: TrackListQuery = {}) =>
      request(`/v1/tracks${pageQuery(query)}`, trackListResponseSchema),
    getTrack: (trackId: string) =>
      request(`/v1/tracks/${encodeURIComponent(trackId)}`, trackResponseSchema),
    /** Makes a share link for a track. The token in the response is never returned again. */
    createTrackShareLink: (trackId: string, input: CreateShareLinkRequest) =>
      post(
        `/v1/tracks/${encodeURIComponent(trackId)}/share-links`,
        createShareLinkResponseSchema,
        input,
      ),
    /** A track's share links, newest first, revoked and expired ones included. */
    listTrackShareLinks: (trackId: string) =>
      request(`/v1/tracks/${encodeURIComponent(trackId)}/share-links`, shareLinkListResponseSchema),
    /** Makes a share link for a project. The token in the response is never returned again. */
    createProjectShareLink: (projectId: string, input: CreateShareLinkRequest) =>
      post(
        `/v1/projects/${encodeURIComponent(projectId)}/share-links`,
        createShareLinkResponseSchema,
        input,
      ),
    /** A project's share links, newest first, revoked and expired ones included. */
    listProjectShareLinks: (projectId: string) =>
      request(
        `/v1/projects/${encodeURIComponent(projectId)}/share-links`,
        shareLinkListResponseSchema,
      ),
    /** What the client's `shareToken` opens; a 404 if the link doesn't work. */
    getSharedResource: () => request('/v1/share-links/current', sharedResourceResponseSchema),
    /** Revokes a share link at once. Safe to repeat. */
    revokeShareLink: (linkId: string) =>
      send('DELETE', `/v1/share-links/${encodeURIComponent(linkId)}`, z.undefined()),
    /** Sets who can hear a track; null makes a project's track follow the project again. */
    updateTrack: (trackId: string, changes: UpdateTrackRequest) =>
      send('PATCH', `/v1/tracks/${encodeURIComponent(trackId)}`, trackResponseSchema, changes),
    /** The signed-in user's projects, newest first. Pass `nextCursor` back as `cursor` for more. */
    listProjects: (query: ProjectListQuery = {}) =>
      request(`/v1/projects${pageQuery(query)}`, projectListResponseSchema),
    /** A project, with any cover upload still processing or that failed. */
    getProject: (projectId: string) =>
      request(`/v1/projects/${encodeURIComponent(projectId)}`, projectDetailResponseSchema),
    /** Starts uploading new cover art; PUT the image to `upload`, then `completeCoverUpload`. */
    startCoverUpload: (projectId: string, input: CreateCoverRequest) =>
      post(
        `/v1/projects/${encodeURIComponent(projectId)}/covers`,
        createCoverResponseSchema,
        input,
      ),
    /** Call once the PUT succeeds. Safe to repeat; returns the cover upload's state. */
    completeCoverUpload: (projectId: string, coverId: string) =>
      post(
        `/v1/projects/${encodeURIComponent(projectId)}/covers/${encodeURIComponent(coverId)}/complete`,
        coverResponseSchema,
      ),
    /** A cover upload's state, to poll while it processes. */
    getCover: (projectId: string, coverId: string) =>
      request(
        `/v1/projects/${encodeURIComponent(projectId)}/covers/${encodeURIComponent(coverId)}`,
        coverResponseSchema,
      ),
    /** Your notifications, newest first, a page at a time. */
    listNotifications: ({ cursor, limit }: NotificationListQuery = {}) => {
      const query = new URLSearchParams();
      if (cursor) query.set('cursor', cursor);
      if (limit !== undefined) query.set('limit', String(limit));
      return request(
        `/v1/notifications${query.size ? `?${query}` : ''}`,
        notificationListResponseSchema,
      );
    },
    /** How many of your notifications are unread. */
    getUnreadCount: () => request('/v1/notifications/unread-count', unreadCountResponseSchema),
    /** Marks these of your notifications read. */
    markNotificationsRead: (ids: string[]) =>
      send('POST', '/v1/notifications/read', z.undefined(), { ids }),
    /** Every comment on a version, in threads, with what the asker may do with each. */
    listFeedback: (versionId: string) =>
      request(`/v1/versions/${encodeURIComponent(versionId)}/feedback`, feedbackListResponseSchema),
    /** Comments on a version (signed in); returns the new thread. */
    createFeedback: (versionId: string, input: CreateFeedbackRequest) =>
      post(`/v1/versions/${encodeURIComponent(versionId)}/feedback`, feedbackThreadSchema, input),
    /** Replies to a top-level comment; returns its thread. */
    replyToFeedback: (feedbackId: string, input: CreateReplyRequest) =>
      post(`/v1/feedback/${encodeURIComponent(feedbackId)}/replies`, feedbackThreadSchema, input),
    /** Edits a comment's body, or resolves or reopens it; returns its thread. */
    updateFeedback: (feedbackId: string, input: UpdateFeedbackRequest) =>
      send('PATCH', `/v1/feedback/${encodeURIComponent(feedbackId)}`, feedbackThreadSchema, input),
    /** Deletes a comment. */
    deleteFeedback: (feedbackId: string) =>
      send('DELETE', `/v1/feedback/${encodeURIComponent(feedbackId)}`, z.undefined()),
    /** Takes the project's cover off. */
    removeCover: (projectId: string) =>
      send('DELETE', `/v1/projects/${encodeURIComponent(projectId)}/cover`, z.undefined()),
    /** Creates a private project. */
    createProject: (input: CreateProjectRequest) =>
      post('/v1/projects', projectResponseSchema, input),
    /** Changes only the fields given. */
    updateProject: (projectId: string, changes: UpdateProjectRequest) =>
      send(
        'PATCH',
        `/v1/projects/${encodeURIComponent(projectId)}`,
        projectResponseSchema,
        changes,
      ),
    /** Deletes the project. Its tracks become loose; no songs are deleted. */
    deleteProject: (projectId: string) =>
      send('DELETE', `/v1/projects/${encodeURIComponent(projectId)}`, z.undefined()),
    /** A project's tracks in order. */
    listProjectTracks: (projectId: string) =>
      request(`/v1/projects/${encodeURIComponent(projectId)}/tracks`, projectTracksResponseSchema),
    /** Adds a track to the end of the project (moving it out of any other). Returns the new list. */
    addProjectTrack: (projectId: string, trackId: string) =>
      post(`/v1/projects/${encodeURIComponent(projectId)}/tracks`, projectTracksResponseSchema, {
        trackId,
      }),
    /**
     * Sets the order. Pass every track in the project, as last loaded; if they've changed since,
     * it throws an `ApiError` with status 409 and nothing moves.
     */
    reorderProjectTracks: (projectId: string, trackIds: string[]) =>
      send(
        'PUT',
        `/v1/projects/${encodeURIComponent(projectId)}/tracks`,
        projectTracksResponseSchema,
        { trackIds },
      ),
    /** Takes a track out of the project; it stays in your tracks. */
    removeProjectTrack: (projectId: string, trackId: string) =>
      send(
        'DELETE',
        `/v1/projects/${encodeURIComponent(projectId)}/tracks/${encodeURIComponent(trackId)}`,
        z.undefined(),
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
