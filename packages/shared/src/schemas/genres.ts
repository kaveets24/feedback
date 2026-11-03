import { z } from 'zod';

/**
 * The genres a track can be filed under, one per track and optional. A fixed list rather than
 * free tags, so the discovery filter isn't split by spellings ("hiphop", "hip hop") and there's no
 * free text to moderate (decided 2026-11-03). New genres go at the end, since Postgres adds enum
 * values there; `GENRE_OPTIONS` sets the order people see.
 */
export const GENRES = [
  'hip-hop',
  'rnb',
  'pop',
  'rock',
  'indie',
  'alternative',
  'electronic',
  'house',
  'techno',
  'uk-garage',
  'grime',
  'bass',
  'electro',
  'drum-and-bass',
  'ambient',
  'lo-fi',
  'jazz',
  'soul-funk',
  'folk',
  'country',
  'singer-songwriter',
  'metal',
  'punk',
  'classical',
  'soundtrack',
  'latin',
  'reggae',
  'afrobeats',
  'experimental',
  'other',
  'juke-footwork',
  'dubstep',
] as const;
export const genreSchema = z.enum(GENRES);
export type Genre = z.infer<typeof genreSchema>;

export const GENRE_LABELS: Record<Genre, string> = {
  'hip-hop': 'Hip-hop',
  rnb: 'R&B',
  pop: 'Pop',
  rock: 'Rock',
  indie: 'Indie',
  alternative: 'Alternative',
  electronic: 'Electronic',
  house: 'House',
  techno: 'Techno',
  'uk-garage': 'UK garage',
  grime: 'Grime',
  bass: 'Bass',
  electro: 'Electro',
  'drum-and-bass': 'Drum & bass',
  ambient: 'Ambient',
  'lo-fi': 'Lo-fi',
  jazz: 'Jazz',
  'soul-funk': 'Soul & funk',
  folk: 'Folk',
  country: 'Country',
  'singer-songwriter': 'Singer-songwriter',
  metal: 'Metal',
  punk: 'Punk',
  classical: 'Classical',
  soundtrack: 'Soundtrack',
  latin: 'Latin',
  reggae: 'Reggae',
  afrobeats: 'Afrobeats',
  experimental: 'Experimental',
  other: 'Other',
  'juke-footwork': 'Juke & footwork',
  dubstep: 'Dubstep',
};

/** Every genre in the order pickers and filters show them: alphabetical, with Other last. */
export const GENRE_OPTIONS: readonly Genre[] = [
  ...GENRES.filter((genre) => genre !== 'other').toSorted((a, b) =>
    GENRE_LABELS[a].localeCompare(GENRE_LABELS[b], 'en'),
  ),
  'other',
];
