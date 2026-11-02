'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext } from 'react';

/** Where the comments are being read: through a share link or not, and how to reload them. */
export type FeedbackPlace = {
  /** The share link's token on the listen page, sent with every comment call. */
  shareToken?: string;
  /** Reloads the comments after a change. */
  onChanged: () => void;
};

export const FeedbackPlaceContext = createContext<FeedbackPlace | null>(null);

/** The place set by the page, or, by default, the signed-in pages' own: refresh the route. */
export function useFeedbackPlace(): FeedbackPlace {
  const place = useContext(FeedbackPlaceContext);
  const router = useRouter();
  return place ?? { onChanged: () => router.refresh() };
}
