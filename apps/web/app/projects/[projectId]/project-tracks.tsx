'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { TrackSummary } from '@feedback/shared';
import { dragStep, moveItem } from '../../../lib/reorder';
import { GripIcon, RemoveIcon } from '../../_shell/icons';
import { TrackLength, TrackSubtitle } from '../../_shell/track-meta';
import {
  removeProjectTrackAction,
  reorderProjectTracksAction,
  restoreProjectTrackAction,
} from '../actions';

interface Drag {
  id: string;
  pointerId: number;
  /** The order when the drag started, to compare against and to restore on cancel. */
  startIds: string[];
  /** Where in the row the pointer took hold, so the row doesn't jump under it. */
  grab: number;
  y: number;
}

/**
 * A project's tracks in running order. Drag a row by its grip, or focus the grip and press the
 * up or down arrow (the keyboard and screen-reader path); either saves the whole order. Saves run one at a
 * time, in order, so quick moves can't arrive at the API out of sequence.
 */
export function ProjectTracks({
  projectId,
  tracks,
}: {
  projectId: string;
  tracks: TrackSummary[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState(tracks);
  // A new list from the server (after a save, or another tab's change) replaces the local one.
  const [serverTracks, setServerTracks] = useState(tracks);
  if (tracks !== serverTracks) {
    setServerTracks(tracks);
    setOrder(tracks);
  }

  const [announcement, setAnnouncement] = useState('');
  /**
   * The last track taken out. Its row stays as a same-height slot with Undo, so it's clear the
   * song wasn't deleted and nothing shifts under the pointer.
   */
  const [removed, setRemoved] = useState<{
    track: TrackSummary;
    ids: string[];
    index: number;
  } | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const drag = useRef<Drag | null>(null);
  const saves = useRef(Promise.resolve());
  /** The track whose grip should get focus back once a keyboard move has rendered. */
  const refocus = useRef<string | null>(null);

  function enqueue(run: () => Promise<{ ok: boolean }>, failure: string) {
    setError(null);
    saves.current = saves.current.then(async () => {
      const result = await run().catch(() => ({ ok: false }));
      if (!result.ok) {
        setOrder(tracks);
        setRemoved(null);
        setError(failure);
        router.refresh();
      }
    });
  }

  function saveOrder(next: TrackSummary[], moved: TrackSummary) {
    // Undo would restore the order from before this move, so it's no longer offered.
    setRemoved(null);
    setAnnouncement(
      `${moved.title} moved to position ${next.indexOf(moved) + 1} of ${next.length}.`,
    );
    const ids = next.map((t) => t.id);
    enqueue(
      () => reorderProjectTracksAction(projectId, ids),
      "Couldn't save the new order, so it's been put back. The project may have changed in another tab; try again.",
    );
  }

  function move(index: number, delta: -1 | 1) {
    const moved = order[index];
    if (!moved || !order[index + delta]) return;
    const next = moveItem(order, index, index + delta);
    refocus.current = moved.id;
    setOrder(next);
    saveOrder(next, moved);
  }

  function remove(track: TrackSummary) {
    setAnnouncement(`Removed ${track.title} from this project. It's still in your tracks.`);
    setRemoved({ track, ids: order.map((t) => t.id), index: order.indexOf(track) });
    setOrder((current) => current.filter((t) => t.id !== track.id));
    enqueue(
      () => removeProjectTrackAction(projectId, track.id),
      `Couldn't remove ${track.title}, so it's back in the list. Reload the page and try again.`,
    );
  }

  function undoRemove() {
    if (!removed) return;
    const { track, ids } = removed;
    const byId = new Map([...order, track].map((t) => [t.id, t]));
    setRemoved(null);
    setOrder(ids.flatMap((id) => byId.get(id) ?? []));
    setAnnouncement(`${track.title} is back in this project.`);
    enqueue(
      () => restoreProjectTrackAction(projectId, track.id, ids),
      `Couldn't put ${track.title} back. Add it again from the list below.`,
    );
  }

  // The removed row took focus with it; hand it to Undo.
  useEffect(() => {
    if (removed) undoRef.current?.focus();
  }, [removed]);

  // A moved row's grip keeps focus, so the arrow keys can carry on moving it.
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-track="${id}"] [data-grip]`)?.focus();
  }, [order]);

  /** Moves the dragged row under the pointer, swapping it past neighbours as it goes. */
  const followPointer = useCallback(() => {
    const current = drag.current;
    const list = listRef.current;
    if (!current || !list) return;
    // Track rows only: the slot a removed track leaves isn't part of the order.
    const rows = (Array.from(list.children) as HTMLElement[]).filter((row) => row.dataset.track);
    const index = rows.findIndex((row) => row.dataset.track === current.id);
    const row = rows[index];
    if (!row) return;

    row.style.transform = '';
    const offset = current.y - current.grab - row.getBoundingClientRect().top;
    const step = dragStep(offset, rows[index - 1]?.offsetHeight, rows[index + 1]?.offsetHeight);
    if (step !== 0) {
      // Re-rendering moves the row; the layout effect below picks the drag up from its new slot.
      setOrder((now) => moveItem(now, index, index + step));
    } else {
      row.style.transform = `translateY(${offset}px)`;
    }
  }, []);

  // After each swap renders, keep the row under the pointer from its new slot.
  useLayoutEffect(() => followPointer(), [order, followPointer]);

  function onGripDown(event: ReactPointerEvent<HTMLElement>, id: string) {
    if (event.button !== 0 || drag.current) return;
    const row = event.currentTarget.closest<HTMLElement>('[data-track]');
    if (!row) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id,
      pointerId: event.pointerId,
      startIds: order.map((t) => t.id),
      grab: event.clientY - row.getBoundingClientRect().top,
      y: event.clientY,
    };
    setError(null);
    setDragId(id);
  }

  function onGripMove(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current.y = event.clientY;
    followPointer();
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>, cancelled: boolean) {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragId(null);
    const row = listRef.current?.querySelector<HTMLElement>(`[data-track="${current.id}"]`);
    if (row) row.style.transform = '';

    if (cancelled) {
      const byId = new Map(order.map((t) => [t.id, t]));
      setOrder(current.startIds.flatMap((id) => byId.get(id) ?? []));
      return;
    }
    const moved = order.find((t) => t.id === current.id);
    if (moved && order.some((t, i) => t.id !== current.startIds[i])) saveOrder(order, moved);
  }

  // Where the removed track was: the same height, so nothing moves under the pointer.
  const removedSlot = removed && (
    <li className="flex min-h-[3.8rem] flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule bg-chrome-lo px-3 py-2 text-sm">
      <span className="text-muted">
        Removed “{removed.track.title}” from this project. It’s still in your tracks.
      </span>
      <button
        ref={undoRef}
        type="button"
        className="link font-medium"
        aria-label={`Undo removing ${removed.track.title}`}
        onClick={undoRemove}
      >
        Undo
      </button>
    </li>
  );

  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <p id={`${projectId}-reorder-help`} hidden>
        Press the up or down arrow key to move this track.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      {order.length === 0 && !removed ? (
        <p className="border-y border-rule py-6 text-muted">
          No tracks in this project yet. Add one below.
        </p>
      ) : (
        <ol ref={listRef} className="border-t border-rule">
          {order.map((track, index) => (
            <Fragment key={track.id}>
              {removed?.index === index && removedSlot}
              <TrackRow
                track={track}
                number={index + 1}
                count={order.length}
                helpId={`${projectId}-reorder-help`}
                dragging={dragId === track.id}
                onMove={(delta) => move(index, delta)}
                onRemove={() => remove(track)}
                onGripDown={(event) => onGripDown(event, track.id)}
                onGripMove={onGripMove}
                onGripUp={(event) => endDrag(event, false)}
                onGripCancel={(event) => endDrag(event, true)}
              />
            </Fragment>
          ))}
          {removed && removed.index >= order.length && removedSlot}
        </ol>
      )}
    </div>
  );
}

type GripHandler = (event: ReactPointerEvent<HTMLElement>) => void;

function TrackRow({
  track,
  number,
  count,
  helpId,
  dragging,
  onMove,
  onRemove,
  onGripDown,
  onGripMove,
  onGripUp,
  onGripCancel,
}: {
  track: TrackSummary;
  number: number;
  count: number;
  /** The element that explains the grip's arrow keys. */
  helpId: string;
  dragging: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onGripDown: GripHandler;
  onGripMove: GripHandler;
  onGripUp: GripHandler;
  onGripCancel: GripHandler;
}) {
  const onGripKey = (event: ReactKeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    onMove(event.key === 'ArrowUp' ? -1 : 1);
  };

  return (
    <li
      data-track={track.id}
      className={`relative grid grid-cols-[1.75rem_2rem_1fr_auto] items-center gap-2 border-b border-rule py-2 sm:grid-cols-[2rem_2.5rem_1fr_4rem_auto] sm:gap-3 ${
        dragging ? 'z-10 rounded-sm bg-chrome-lo outline-2 outline-accent' : ''
      }`}
    >
      {/* Drag it with a pointer, or focus it and use the up and down arrows. */}
      <button
        type="button"
        data-grip
        aria-label={`Reorder ${track.title}, position ${number} of ${count}`}
        aria-describedby={helpId}
        title="Drag to reorder"
        className={`focus-glow flex h-10 touch-none items-center justify-center rounded-sm text-field-edge hover:text-accent focus-visible:text-accent ${
          dragging ? 'cursor-grabbing text-accent' : 'cursor-grab'
        }`}
        onKeyDown={onGripKey}
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripCancel}
      >
        <GripIcon />
      </button>
      <span className="font-lcd text-base text-muted tabular-nums">
        {String(number).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <Link
          href={`/tracks/${track.id}`}
          className="link line-clamp-2 font-medium break-words no-underline sm:line-clamp-1"
        >
          {track.title}
        </Link>
        <TrackSubtitle track={track} />
      </div>
      <TrackLength track={track} />
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label={`Remove ${track.title} from this project`}
        title="Remove from project"
        onClick={onRemove}
      >
        <RemoveIcon />
      </button>
    </li>
  );
}
