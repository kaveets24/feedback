---
version: 1
slug: 'app-profiles-handle-page-tsx'
primary_target: 'app/profiles/[handle]/page.tsx'
related_targets: ['app/profiles/[handle]/follow-button.tsx']
---

# Public profile: someone's page at /@handle

Scope: `/@handle` (served from `app/profiles/[handle]/page.tsx`), the same for everyone, the owner included: identity (picture, name, @handle, city, bio), Follow (or Sign in to follow; Edit profile for the owner), and the person's public tracks and projects. Visitor mode: Operate. Build path: code-led (no image generation; the owner locked the "Tabs" sketch, `.impeccable/mocks/decision/tabs.html`).

Audience and job: a listener who found someone through home, search, or a comment decides whether to follow them and plays their work in place. The owner checks how their page looks to everyone.

## Direction contract

THESIS: An artist's page is an identity block over two short lists you switch between, Tracks and Projects, each as dense and playable as home's results. It refuses the category default of a banner hero over a grid of cover cards and follower counts.

OWN-WORLD: The working-screen world, unchanged. Green-black canvas, system sans, the picture bare (square, small corners, 1px rule edge), flat graphite buttons, rows on 1px rules, lengths in Silkscreen, release types in the LCD badge. The tab bar uses the header nav's grammar: muted 500 labels, the current one in ink with the 2px accent underline. The row transport button is the only hardware.

STORY: A visitor reads who this is, presses Follow, plays a track from the list without leaving, and switches to Projects to open a release. Followed, the button says so and the feed promise is one muted line.

FIRST VIEWPORT: Header, then the 48rem column: the 80px picture beside the name (H1), "@handle · City" muted, the bio up to 60ch, and Follow (primary) at the right from sm, under the text on phones. Then the Tracks / Projects tab bar on a rule, and the active list: track rows (transport, title over "Project · Genre · vN", LCD length) or project rows (48px cover, title and description, release type badge).

FORM: Tabs, my list's position 4 of 7, dealt by the roll and chosen by the owner. seed: 4f0272c8fccf5369

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

Play from the row, as on home: the transport button plays the track in the mini-player and the row lights (chrome-lo fill bleeding 12px, 2px accent bar, title in accent). The tabs are links (`?tab=projects`), so they work without JavaScript and keep their place on reload.

## Unresolved

- No follower or play counts anywhere (docs/product.md). Tab labels carry how many public tracks and projects there are, which is a content count, not a popularity number.
