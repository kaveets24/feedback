---
version: 1
slug: 'app-notifications-page-tsx'
primary_target: 'app/notifications/page.tsx'
related_targets: ['app/notifications/notification-list.tsx']
---

# Notifications: what people said about your tracks

Scope: `/notifications` (`app/notifications/page.tsx`), for the signed-in artist: comments and replies other people left on their tracks, newest first, a page at a time. Visitor mode: Operate. Build path: code-led (no image generation; the owner locked the "Grouped by day" sketch, `.impeccable/mocks/decision/by-day.html`).

Audience and job: an artist who saw the bell's count checks what came in and how recently, then opens a comment on its track to answer it. Each visit is short, and often on a phone. Opening the page marks what it shows as read.

## Direction contract

THESIS: Notifications read as a log under day headings, so how recently people have been listening is visible at a glance. It refuses the category default of a flat feed with a relative timestamp on every row.

OWN-WORLD: The working-screen world, unchanged. Green-black canvas, system sans, pictures bare (square, small corners, 1px rule edge), rows on 1px rules with a 60% chrome-lo hover. Day headings use the genre rail's small 600 muted label. No hardware and no LCD wells: the one bright thing on the page is NEW in the bitmap face, in accent, the same treatment as the bell's unread count.

STORY: A visitor sees Today first and reads who said what on which track and version. New rows are labelled for this visit even after they're marked read. They press a row and land on that comment on the track page.

FIRST VIEWPORT: Header, then the 48rem column: the Notifications H1, then a muted day heading with its list on rules, each row a 24px picture, "Mara Ellis commented on Night Drive v3" (names and titles at 500 ink, the verb and version muted), the quote in small muted under it, and NEW at the right on new rows. More days follow, 28px apart. Newest and Older links sit under the last list.

FORM: Grouped by day, my list's position 4 of 6, dealt by the roll and chosen by the owner. seed:3fc7491ba18240d7

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

The NEW label stays through the visit: a row is marked read as soon as it's shown and the header's count clears, but its label holds until the next visit, so nothing vanishes while being read. The whole row is the link, with keyboard focus around the whole row.

## Unresolved

- Days use the viewer's own time zone, so "Today" means their today. The first server render uses UTC, and the browser corrects it after hydrating.
- A day can continue on the next page of older notifications, repeating its heading there.
- A notification doesn't carry the comment's moment on the waveform, so rows can't show "at 1:23" without an API change.
