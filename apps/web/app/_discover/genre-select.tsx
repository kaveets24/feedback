'use client';

import { useRouter } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { GENRE_LABELS, GENRE_OPTIONS, genreSchema } from '@feedback/shared';
import { DownIcon } from '../_shell/icons';
import { href, type Filters } from './filters';

/**
 * The genre filter on phones, beside the results' heading (the rail does it from `md`). It applies
 * as soon as it's picked, keeping the view and search like the rail's links, and never moves the
 * page or stops the mini-player. It belongs to the search form (`form`) even when hidden, so a
 * search keeps the genre the rail picked, and one still works without JavaScript.
 */
export function GenreSelect({
  form,
  view,
  q,
  genre,
}: Pick<Filters, 'view' | 'q' | 'genre'> & {
  /** The id of the search form. */
  form: string;
}) {
  const router = useRouter();
  const [shown, setShown] = useOptimistic<string>(genre ?? '');
  const [, startTransition] = useTransition();

  function choose(value: string) {
    startTransition(() => {
      setShown(value);
      router.push(href({ view, q, genre: genreSchema.safeParse(value).data }), { scroll: false });
    });
  }

  return (
    <div className="relative w-46 shrink-0 md:hidden">
      <label htmlFor="search-genre" className="sr-only">
        Genre
      </label>
      <select
        id="search-genre"
        name="genre"
        form={form}
        value={shown}
        onChange={(event) => choose(event.target.value)}
        className="field appearance-none pr-10"
      >
        <option value="">All genres</option>
        {GENRE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {GENRE_LABELS[option]}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
        <DownIcon />
      </span>
    </div>
  );
}
