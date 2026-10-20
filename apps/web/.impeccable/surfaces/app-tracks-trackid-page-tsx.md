---
version: 1
slug: 'app-tracks-trackid-page-tsx'
primary_target: 'app/tracks/[trackId]/page.tsx'
related_targets: ['app/upload-form.tsx']
---

# Track page: listen, version history, new version

Scope: `/tracks/[trackId]` around its player: the header block (back link, title, the project link with Change, which opens the Project selector), the latest version's status line, the version history with editable change notes, and the "Upload a new version" form. The player itself is its own surface (`app/_player/`) and is unchanged. Visitor mode: Operate. Build path: code-led (a narrow request inside the established world, no image generation).

Audience and job: the artist comes back to a song to listen to the current version, read what changed between bounces, fix a note, and drop in the next bounce. Later (Phase 4), link holders will see this page too, read-only.

## Direction contract

THESIS: A song's page is its player over its history: the newest bounce plays at the top, and every version below reads like the track listing on a tape's J-card, numbered, annotated in the artist's words, with its length. It refuses the category default: a file-manager table of versions with download and kebab menus.

OWN-WORLD: The established world, unchanged. Green-black canvas, system sans for all text, flat graphite fields and buttons with a 1px field-edge, rows on 1px rules. Silkscreen only for figures: the version number (V3) and lengths, all at 1rem; file names and dates are plain sans. The player panel stays the page's one piece of hardware. Uploading a new version reuses home's striped LCD bar.

STORY: The artist sees the title and where the track lives, presses play, reads down the versions (what changed, when, how long), edits a note inline, then uploads the next bounce with its notes. It lands as the newest row, processing, and plays once it's ready.

FIRST VIEWPORT: Header, then the 48rem column: a muted "Your tracks" back link, the title as H1 (1.875rem, 600), then a small row: a muted "Project" label, the project as a link (or "Not in a project"), and a ghost Change button. Change opens the Project selector in its place (select with a drawn chevron, Move and Cancel on one row, up to 28rem wide). The player panel follows, with any processing or failed line under it. Then the "Versions" H2 and rows: V-number at the left, the notes over a muted "night-drive-v3.wav · October 13, 2026" line in the middle (non-ready versions lead with their status), the length in a right-aligned 4rem LCD column from sm (in the line on phones), and Edit notes as a 40px ghost pencil button at the far right. "Upload a new version" closes the page.

FORM: Established-world extension; the player stays the signature. seed: none (narrow request inside the established world; no concept roll ran)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

The player (its own brief). On this surface: editing a version's notes in place. The note becomes a textarea with Save and Cancel right where it was, Escape cancels, and focus returns to Edit notes afterwards. A new upload lands as the newest row without leaving the page.

## Unresolved

- Choosing which version plays (the A/B switch) is PR 7. History rows don't play yet.
- Versions whose file never arrived are left out of the history, except the newest while its upload might still be running.
