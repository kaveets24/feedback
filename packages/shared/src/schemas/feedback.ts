// Feedback (comments) on a track's versions. The request and response schemas come with the API;
// these are the values the database and the API share.

/** A top-level comment is open until the artist resolves it. Replies stay `open`. */
export const FEEDBACK_STATUSES = ['open', 'resolved'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** Longest comment body, in characters. */
export const MAX_FEEDBACK_LENGTH = 2000;
