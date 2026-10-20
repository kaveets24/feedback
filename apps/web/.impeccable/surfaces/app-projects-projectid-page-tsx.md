---
version: 1
slug: 'app-projects-projectid-page-tsx'
primary_target: 'app/projects/[projectId]/page.tsx'
related_targets: ['app/projects/page.tsx', 'app/_shell/app-header.tsx']
---

# Projects: projects list and project page

Scope: `/projects` (the artist's projects and a new-project form), `/projects/[projectId]` (one project: details, status, its ordered tracks), and the shared app header that every page now carries. Visitor mode: Operate. Build path: code-led (Operate surface, no image generation). Home and the track page bodies stay plain for now; the track page gains a plain "Project" selector.

Audience and job: a solo producer organizing rough tracks into an EP or idea folder, mostly at a desk, sometimes on a phone. They set what kind of release it is, put songs in running order, add loose tracks, and rename or delete the project. Everything is private until Phase 4.

## Direction contract

THESIS: A project is a running order with a release type. Its page leads with the type drawn as a four-segment LCD picker (Single, EP, Album, Compilation) that the artist clicks to change, over a numbered running order they drag into shape. It refuses the category default: a grid of project cards and a status dropdown.

OWN-WORLD: The player's world, extended to working screens. Green-black canvas, system sans for every title, form and body line, solid graphite surfaces for controls, 1px rules between rows. A recessed LCD window only for the release type picker and the list's release type badges; track numbers, lengths and the total time read out in Silkscreen straight on the canvas, so the picker stays the one signature. Lime accent for focus, hover, the current nav item and the row being dragged. No gradients behind text, no cards.

STORY: The artist sees which project this is, what kind of release it is and its songs in order. They change the type in one click, drag or nudge songs into order, add a track from the picker, and edit or delete the project in plain, serious words.

FIRST VIEWPORT: App header: lime Silkscreen wordmark, Tracks and Projects nav with a 2px accent underline on the current one, Sign out at the right. A 48rem column: a "Projects" back link, the title as H1 (1.875rem, 600), the description in muted ink at 65ch, then one row with the release type picker (the chosen segment solid lime with dark text, the others unlit but readable), "Private: only you can see this project", and Edit. Below: "Tracks" with "5 tracks · 17:39", then rows of grip, LCD number, title link, version or state, LCD length, remove. The add-a-track picker sits at the list's foot.

FORM: Status pipeline, position 6 of 7 on the ordered list (dealt lead). seed:df0245d063152caf

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

Dragging a track by its grip: the row lifts (accent outline, solid graphite fill) and its neighbours swap as it crosses their midpoints, so the list is always a real order. Releasing saves the whole order. The focused grip does the same from the keyboard or a screen reader with the up and down arrows, and a polite live region says where the track landed. If the order changed elsewhere, the list snaps back and says so. The only motion is the drag itself.

## Cover art (Phase 3 PR 6)

The cover sits square beside the title (96px on phones, 128px from sm), with a quiet graphite placeholder and a pixel note until there is one, and as a 48px thumbnail leading each projects-list row. "Add cover art" / "Change cover art" is a muted text link under the description (40px tall, no fill, aligned with the title column; it was a ghost button, but its hover fill touched the cover at phone width); uploading shows home's striped bar, then a plain status line while the worker crops it square and strips photo metadata (the line says so, since that's the privacy promise). A failed image says why. Removing the cover is a plain, non-destructive button in Edit mode. No chrome or LCD well around the cover: the art is the colour.

## Unresolved

- Project track counts and total length aren't in the projects list API, so the list shows title, release type and description only.
