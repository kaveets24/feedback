---
version: 1
slug: 'app-page-tsx'
primary_target: 'app/page.tsx'
related_targets: ['app/_discover/result-row.tsx']
---

# Home: discovery for everyone

Scope: `/`, the discovery page, in every state: signed out, signed in, pending, and rejected. Search (`q`), a genre filter, the public track list with play from the row, people matching a search, and paging. The feed moved to `/feed` and your tracks are at `/tracks` (2026-11-03). Visitor mode: Operate. Build path: code-led (no image generation; the owner locked the "Filter rail" sketch, `.impeccable/mocks/decision/filter-rail.html`).

Audience and job: anyone, often a phone visitor or a producer between sessions, finds public works in progress and listens without leaving the list. Signed-out visitors also need one line on what this is and the way in; pending and rejected accounts see their status above the same list.

## Direction contract

THESIS: Home is a music library's browser: a rail of genres beside a results list you can play from in place. It refuses the category default of a hero over a grid of cover cards, and the big search-engine box.

OWN-WORLD: The working-screen world, unchanged. Green-black canvas, system sans, flat graphite fields, rows on 1px rules, lengths in Silkscreen. The rail is flat sans links; the current genre is lit like the version in the player (a chrome-lo fill and a 2px accent bar). Each row carries a 44px bevel transport button, the one piece of hardware on the page.

STORY: A visitor scans the newest public tracks, narrows by genre in the rail or searches a title, artist, or @handle, presses play on a row, and keeps browsing while the mini-player plays. The row that's playing stays lit.

FIRST VIEWPORT: Header, then the 48rem column split into an 11rem rail and the results (32px apart) from md. The rail: a small "Genre" label, then All and every genre as compact links. Results: the H1 "Discover", the muted line, the search field and primary Search button on one row, then "Latest" (or "Results") with the rows: transport button, title over artist · genre · v3, the LCD length, and the date. On phones the rail becomes a Genre select in the search form.

FORM: Filter rail, my list's position 5 of 7, dealt by the roll and chosen by the owner. seed: 893f2477e257f3a4

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

Play from the row: the transport button loads that version into the global mini-player without leaving the list, and the row that's in the player lights (chrome-lo fill bleeding into the gutter, a 2px accent bar, the title in accent) with `aria-current`. Pressing it again pauses. The rail's current genre uses the same light, so "what's on" reads the same in both places.

## Unresolved

- The sketch was 1120px wide; the build keeps the app's 48rem column, with the rail inside it, so the header and every other page stay aligned.
