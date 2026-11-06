---
version: 1
slug: 'app-projects-projectid-page-tsx'
primary_target: 'app/projects/[projectId]/page.tsx'
related_targets:
  [
    'app/projects/page.tsx',
    'app/_shell/app-header.tsx',
    'app/_listen/listener-view.tsx',
    'app/_album/album.tsx',
  ]
---

# Projects: projects list and project page

Scope: `/projects` (the artist's projects and a new-project form), `/projects/[projectId]` (one project: details, status, its ordered tracks), and the shared app header that every page now carries. Visitor mode: Operate. Build path: code-led (Operate surface, no image generation). Home and the track page bodies stay plain for now; the track page gains a plain "Project" selector.

Audience and job: a solo producer listening back to a group of rough tracks as a whole and shaping it, mostly at a desk, sometimes on a phone; and anyone they've let hear it, often on a phone through a share link. Both press play and hear it in order. The producer also puts songs in running order, adds loose tracks, and renames or deletes the project.

## Direction contract

THESIS: A project is an album you can press play on, whoever you are (decided 2026-11-06, replacing "a running order with a release type"). The page is the cover, who made it, a Play button, and numbered tracks that play in place through the mini-player, the only player on it. It refuses a second player and comments on this page: those live on each track's page. Sorting is a tool behind Arrange, not what the page is for.

OWN-WORLD: The player's world, extended to working screens. Green-black canvas, system sans for every title, form and body line, solid graphite surfaces for controls, 1px rules between rows. A recessed LCD window only for the release type (a badge, and the picker in Edit mode); track numbers, lengths and the total time read out in Silkscreen straight on the canvas. Lime accent for Play, focus, hover, the current nav item, the row in the player and the row being dragged. No gradients behind text, no cards.

STORY: Anyone sees which project this is, who made it, and its songs in order, and presses Play or a track's own button. It carries on from track to track as they browse the app, with previous and next in the mini-player. To comment, they open a track. The artist can also press Arrange to drag or nudge songs into order and add or remove them, and use the pencil to change the words and release type or delete the project, in plain, serious words. Who can hear it stays stated under the title.

FIRST VIEWPORT: App header: lime Silkscreen wordmark, Tracks and Projects nav with a 2px accent underline on the current one, the notifications bell and Profile at the right. A 48rem column: for the owner a "Projects" back link; the cover beside the title as H1 (1.875rem, 600, with a ghost pencil button for the owner), "By <artist>", and the description in muted ink at 65ch; then one row with the primary Play button, the release type badge, and for the owner "Private: only you can see and hear this project". Below: "Tracks" with "5 tracks · 17:39" and the owner's Arrange, then rows of transport button, LCD number, title link, version or state, LCD length. Arranging swaps those for grip, number, title, length, remove, with the add-a-track picker at the list's foot.

FORM: Album, with the mini-player as its transport; it grew out of the Status pipeline layout chosen on 2026-10-19 (seed:df0245d063152caf).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

Pressing Play: the track's row lights, the mini-player takes over with previous and next, and the album moves on by itself, stopping after the last track. Arranging is the second interaction. Dragging a track by its grip: the row lifts (accent outline, solid graphite fill) and its neighbours swap as it crosses their midpoints, so the list is always a real order. Releasing saves the whole order. The focused grip does the same from the keyboard or a screen reader with the up and down arrows, and a polite live region says where the track landed. If the order changed elsewhere, the list snaps back and says so. The only motion is the drag itself.

## Cover art (Phase 3 PR 6)

The cover sits square beside the title (112px on phones, 192px from sm; it was 96 and 128 until the page became an album), with a quiet graphite placeholder and a pixel note until there is one, and as a 48px thumbnail leading each projects-list row. "Add cover art" / "Change cover art" is a muted text link under the description (40px tall, no fill, aligned with the title column; it was a ghost button, but its hover fill touched the cover at phone width); uploading shows home's striped bar, then a plain status line while the worker crops it square and strips photo metadata (the line says so, since that's the privacy promise). A failed image says why. Removing the cover is a plain, non-destructive button in Edit mode. No chrome or LCD well around the cover: the art is the colour.

## Unresolved

- Project track counts and total length aren't in the projects list API, so the list shows title, release type and description only.
