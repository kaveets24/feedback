---
name: Feedback
description: A Winamp-era hardware player for unfinished music, extended to flat graphite working screens. Styled so far are the player, the app header, home (apart from the feed), your tracks, the project pages (with cover art), the track page, and the profile page.
colors:
  canvas: '#0b0e0c'
  ink: '#e4eae5'
  muted: '#9aa59e'
  rule: '#262b28'
  field-edge: '#707a73'
  chrome-hi: '#454d48'
  chrome-lo: '#1d211f'
  chrome-edge: '#050605'
  chrome-lip: '#555d58'
  button-hi: '#4b534e'
  button-lo: '#262b28'
  lcd: '#07140c'
  lcd-ink: '#b9f45c'
  lcd-dim: 'color-mix(in oklab, #b9f45c 42%, #07140c)'
  lcd-cell: 'color-mix(in oklab, #b9f45c 9%, #07140c)'
  lcd-ghost: 'color-mix(in oklab, #b9f45c 16%, #07140c)'
  lcd-unlit: '#7f9a55'
  lcd-cyan: '#6fe3f5'
  accent: '#a8f03f'
  danger: '#ff8a7a'
typography:
  lcd-display:
    fontFamily: 'Silkscreen, ui-monospace, monospace'
    fontSize: '1.5rem'
    fontWeight: 400
  lcd-display-sm-up:
    fontFamily: 'Silkscreen, ui-monospace, monospace'
    fontSize: '1.875rem'
    fontWeight: 400
  wordmark:
    fontFamily: 'Silkscreen, ui-monospace, monospace'
    fontSize: '1.125rem'
    fontWeight: 400
  lcd-secondary:
    fontFamily: 'Silkscreen, ui-monospace, monospace'
    fontSize: '0.875rem'
    fontWeight: 400
  lcd-figure:
    fontFamily: 'Silkscreen, ui-monospace, monospace'
    fontSize: '1rem'
    fontWeight: 400
  lcd-figure-sm:
    fontFamily: 'Silkscreen, ui-monospace, monospace'
    fontSize: '0.875rem'
    fontWeight: 400
  lcd-label:
    fontFamily: 'Silkscreen, ui-monospace, monospace'
    fontSize: '0.75rem'
    fontWeight: 400
  headline:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.875rem'
    fontWeight: 600
  section-title:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 600
  title:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 500
  body:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
  label:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 500
rounded:
  segment: '2px'
  sm: '0.25rem'
  md: '0.375rem'
  lg: '0.5rem'
spacing:
  tight: '8px'
  panel: '12px'
  gutter: '16px'
  section: '48px'
  header: '56px'
  container: '48rem'
components:
  player-panel:
    backgroundColor: '{colors.chrome-hi}'
    rounded: '{rounded.lg}'
    padding: '12px'
  lcd-window:
    backgroundColor: '{colors.lcd}'
    textColor: '{colors.lcd-ink}'
    rounded: '{rounded.sm}'
    padding: '6px 12px'
  waveform-window:
    backgroundColor: '{colors.lcd}'
    rounded: '{rounded.sm}'
    height: '96px'
  waveform-window-sm-up:
    height: '128px'
  transport-button-lg:
    backgroundColor: '{colors.button-hi}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    size: '56px'
  transport-button-md:
    backgroundColor: '{colors.button-hi}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    size: '44px'
  transport-button-active:
    textColor: '{colors.accent}'
  mini-player:
    backgroundColor: '{colors.chrome-hi}'
    textColor: '{colors.ink}'
    padding: '8px 16px'
  app-header:
    backgroundColor: '{colors.canvas}'
    height: '56px'
  button:
    backgroundColor: '{colors.chrome-lo}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '40px'
  button-hover:
    textColor: '{colors.accent}'
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '40px'
  button-danger:
    backgroundColor: '{colors.chrome-lo}'
    textColor: '{colors.danger}'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '40px'
  button-danger-hover:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.canvas}'
  button-ghost:
    textColor: '{colors.muted}'
    rounded: '{rounded.md}'
    height: '40px'
  button-ghost-hover:
    backgroundColor: '{colors.chrome-lo}'
  button-icon:
    size: '40px'
  field:
    backgroundColor: '{colors.chrome-lo}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '8px 12px'
    height: '40px'
  type-segment:
    textColor: '{colors.lcd-unlit}'
    typography: '{typography.lcd-label}'
    rounded: '{rounded.segment}'
    padding: '6px 12px'
  type-segment-current:
    backgroundColor: '{colors.lcd-ink}'
    textColor: '{colors.lcd}'
  type-badge:
    backgroundColor: '{colors.lcd}'
    textColor: '{colors.lcd-ink}'
    typography: '{typography.lcd-label}'
    rounded: '{rounded.sm}'
    padding: '4px 8px'
    width: '7.5rem'
  project-cover-list:
    backgroundColor: '{colors.chrome-lo}'
    rounded: '{rounded.sm}'
    size: '48px'
  project-cover-page:
    backgroundColor: '{colors.chrome-lo}'
    rounded: '{rounded.sm}'
    size: '96px'
  project-cover-page-sm-up:
    size: '128px'
  project-cover-placeholder:
    backgroundColor: '{colors.chrome-lo}'
    textColor: '{colors.field-edge}'
    rounded: '{rounded.sm}'
  track-row-dragging:
    backgroundColor: '{colors.chrome-lo}'
    rounded: '{rounded.sm}'
  list-row:
    textColor: '{colors.ink}'
    padding: '12px 0'
  version-row:
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    padding: '12px 0'
  upload-progress:
    backgroundColor: '{colors.lcd}'
    textColor: '{colors.lcd-ink}'
    typography: '{typography.lcd-figure}'
    rounded: '{rounded.sm}'
    padding: '8px 12px'
  upload-progress-track:
    backgroundColor: '{colors.lcd-cell}'
    rounded: '{rounded.segment}'
    height: '12px'
---

# Design System: Feedback

## Overview

**Creative North Star: "The Hardware Player"**

Feedback borrows the late-90s desktop music player: a graphite hardware housing, a recessed LCD window with lime phosphor ink, and chunky bevel buttons that sink when pressed. The waveform sits inside the LCD as segmented bars. The part you've already heard is lit, the rest shows as dim lime, and the empty cells stay faintly visible behind both, like the unlit segments on a real LCD.

**Scope so far: the player, the app header, home (apart from the feed), your tracks, the project pages, the track page, and the profile page.** The player means the track page's waveform player and the global mini-player. The app header sits on every page. Home (`/` signed out, pending, and rejected; signed in, it's the feed, still plain HTML), your tracks (`/tracks`, with the upload form), the projects list (`/projects`), the project page (`/projects/[projectId]`, with its cover art), and the track page around its player (`/tracks/[trackId]`: the header block, the Project selector, the version history with its notes editor, and the new-version upload), and the profile page (`/settings/profile`) are the working screens: the player's world extended to forms and lists, with flat graphite controls, 1px rules between rows, and the LCD well kept for things that read out (the release type picker, the release type badge, and the upload progress bar). A project's cover art is the one image in the system, and it sits bare, without chrome or an LCD well. Every page uses the same 48rem column under the header, but the bodies of sign-in and sign-up are still deliberately plain semantic HTML. The direction for everything not built yet (glossy LimeWire toolbars, results tables, window panels, Aqua surfaces, light mode, skins) is in CLAUDE.md section 9, "Visual style: Y2K / Winamp / LimeWire". It is not recorded here because none of it exists in code. When one of those surfaces gets built, add it to this file from the shipped code.

The system is quiet and practical: dark only, no decorative motion, and one bright signature per screen (the lit LCD of the player, the release type picker on a project, or the upload bar on your tracks while a file goes up). All tokens live in `app/globals.css` under `@theme`, and components use them, never one-off hex values.

**Key Characteristics:**

- Graphite chrome housing on the player, raised by a 1px top highlight and a soft drop.
- Recessed deep green-black LCD windows set into their surroundings with a dark lip and a faint outer highlight.
- Lit, dim, and unlit segments: the LCD always shows its unlit state.
- Working screens are flat: solid graphite controls with a 1px edge, lists on 1px rules, no cards and no gradients behind text.
- Lime for content inside the LCD, a slightly different lime for interaction, cyan for secondary player readouts and the playhead.
- Bitmap face for readouts, figures, and the wordmark; clean system sans for everything else.
- Cover art sits bare: a square with small corners and a 1px hairline, never housed in chrome or an LCD well.
- Still by default: the only motion is a dragged row following the pointer and the upload bar's stripes drifting while an upload is in progress (still under reduced motion).

## Colors

A green-tinted near-black world: graphite chrome, a deeper green-black LCD, lime phosphor, and a cyan second channel.

### Primary

- **Phosphor Lime** (`lcd-ink`): what displays. The elapsed time, played waveform segments, the time in the mini-player, the chosen segment in the release type picker and the A/B switch (a solid fill with `lcd` text), the release type badge's word, the upload bar's lit stripes and percent, and the header wordmark. 14.5:1 on the LCD.
- **Signal Lime** (`accent`): interaction. The focus outline and glow, the hover color of buttons, links and nav items, the current nav item's underline, the dragged row's outline, the transport icon while playing or loading, the keyboard focus around a whole list row, the text-selection background (with `canvas` text), the caret, and native control accents. It is also the fill of the one primary button in a form, with `canvas` text (14:1).

### Secondary

- **LCD Cyan** (`lcd-cyan`): the second LCD channel, in the player only. The playhead (a 2px bar), "/ total" time, and the version plus state word (Stopped, Loading, Playing, Paused, Error). 12.5:1 on the LCD.

### Tertiary

- **Soft Coral** (`danger`): error lines (playback, forms, saves) set in body sans, never in the LCD, and the destructive button's text and edge, filling solid with `canvas` text on hover (8.5:1 either way).

### Neutral

- **Green Black** (`canvas`): the page background, and the header's.
- **Pale Mint Ink** (`ink`): body text, titles, button text, and the transport icon at rest. 15.9:1 on the canvas.
- **Sage Grey** (`muted`): secondary text: descriptions, counts, the privacy line, the body of the pending and rejected notices, the chosen file name, track subtitles, track numbers, placeholders, inactive nav items, ghost buttons, and Sign out. 7.6:1 on the canvas, 6.4:1 on `chrome-lo`.
- **Hairline** (`rule`): 1px lines between list rows, above and below lists, under the header, and above the Cover art and Delete project sections in Edit mode; the 1px edge of a project cover (image or placeholder); the edge of a disabled button.
- **Field Edge** (`field-edge`): the 1px edge of inputs and buttons, link underlines at rest, the drag grip at rest, the note on an empty cover, and the scrollbar thumb. 4.4:1 on the canvas and 3.7:1 on `chrome-lo`, above the 3:1 non-text minimum.
- **Graphite High / Low** (`chrome-hi` / `chrome-lo`): the panel gradient, top to bottom. `chrome-lo` alone is the solid fill of the mini-player, every working button and field, the dragged row, the removed-track slot, the project cover's backing and its empty placeholder, and list-row hover (at 60%); it also forms the dark lip around each LCD window. `chrome-hi` is the text and icon color of a disabled ghost button.
- **Chrome Edge** (`chrome-edge`): the 1px near-black outline on panels, LCD windows, and transport buttons.
- **Chrome Lip** (`chrome-lip`): the faint outer ring that makes an LCD window look set in.
- **Button High / Low** (`button-hi` / `button-lo`): the transport button gradient, flipped when pressed.
- **LCD Black** (`lcd`): the LCD window background.
- **Dim Phosphor** (`lcd-dim`): waveform segments still to play, and the darker of the upload bar's lit stripes.
- **Unlit Cell** (`lcd-cell`): every possible waveform segment, drawn behind the bars, and the darker of the upload bar's unlit stripes.
- **Ghost Segment** (`lcd-ghost`): the unlit "8" behind each LCD digit, and the lighter of the upload bar's unlit stripes.
- **Unlit Label** (`lcd-unlit`): segments not chosen (release types, the other A/B side): unlit, but readable as words. 6:1 on the LCD.

### Named Rules

**The Lit and Unlit Rule.** The LCD always shows its unlit state: played audio is `lcd-ink`, audio still to play is `lcd-dim`, empty cells are `lcd-cell`, and every digit sits over a ghost "8" in `lcd-ghost`. Segment pickers work the same way: the chosen segment solid `lcd-ink`, the rest in `lcd-unlit` (words must stay readable, so they don't drop to `lcd-cell`). The upload bar too: its done part is lit stripes (`lcd-ink` and `lcd-dim`), and the rest of the track shows the same stripes held still in `lcd-ghost` and `lcd-cell`. Never draw LCD content on a blank window.

**The Two Limes Rule.** `lcd-ink` is what displays (LCD content and the wordmark); `accent` is what responds to you (focus, hover, the current nav item, the dragged row, selection, and the primary button's fill). Don't swap them.

**The Cyan Channel Rule.** Cyan appears only in LCD contexts: the playhead and secondary readouts. It is never a button, link, or body color.

## Typography

**Display Font:** Silkscreen (with ui-monospace, monospace), self-hosted through next/font as `--font-silkscreen` and exposed as `font-lcd`.
**Body Font:** the system sans stack (Tailwind's default `ui-sans-serif, system-ui, sans-serif`).

**Character:** a bitmap LCD face for numbers, short readout labels, and the wordmark, next to a plain system sans that keeps titles, forms, errors, and page text easy to read.

### Hierarchy

- **LCD Display** (400, 1.5rem, 1.875rem from `sm`): elapsed time on the track page player, set in fixed-width cells (0.8em per digit, 0.45em per colon) so the readout doesn't shift as it ticks.
- **Wordmark** (400, 1.125rem): "Feedback" in `lcd-ink` at the left of the header.
- **LCD Secondary** (400, 0.875rem, 1rem from `sm`): "/ total" in cyan.
- **LCD Figure** (400, 1rem, tabular): track lengths in `ink` on your tracks' and project rows, in the length column and inline in the subtitle on phones (a muted "—" when there's none), the project page's two-digit track numbers in `muted`, the version number ("V3") in `ink` at the head of each version row, a version's length in `ink` (its own column from `sm`, inline in the meta line on phones), and the upload percent in `lcd-ink`.
- **LCD Figure Small** (400, 0.875rem, tabular): the project's total length, inline in the small "Tracks" count line.
- **LCD Label** (400, 0.75rem): the time line in the mini-player, the version and state word on the track player, and the release type segment and badge words (uppercase on the last three).
- **Headline** (600, 1.875rem): the page H1 ("Your tracks", "Projects", the project title, the track title, "Edit project", and the pending and rejected notices), balanced when it wraps; the track title also breaks long words. On the signed-out welcome the visible headline is the pitch at this size, capped at 24ch and balanced; the H1 "Feedback" there is visually hidden, since the wordmark already shows it.
- **Section Title** (600, 1.125rem): H2s ("Upload a track", "Tracks", "Your projects", "Versions", "Upload a new version"); in a project's Edit mode the "Cover art" and "Delete project" H2s drop to 1rem.
- **Title** (500, 0.875rem): the track title link in the mini-player. List titles use body size at 500.
- **Body** (400, 1rem): page text, field text, and the confirmation sentence; descriptions and the upload privacy line run in `muted` at 65ch, and the pending and rejected notices in `muted` at 60ch with the email in `ink` at 500. A version's change notes run in `ink` with their line breaks kept, or a muted "No change notes." Small text (0.875rem) carries form labels (500; an "(optional)" note inside a label drops to 400 `muted`), counts, subtitles, the privacy line, status lines, the version meta line, and errors; the mini-player's error is 0.75rem.
- **Version meta line** (400, 0.875rem, sans, `muted`): the original file name and the date ("October 20, 2026", kept on one line), plus the length on phones. A version that isn't ready leads with its status (a failed one in `danger`). Long file names break anywhere rather than widen the row.

### Named Rules

**The Bitmap for Readouts Rule.** Silkscreen is for readouts and figures: times (including the "1:23" in the profile's name preview), lengths, totals, track numbers, percents, version numbers, state words, release types, and the wordmark. Titles, labels, buttons, errors, forms, comments, and body text use the sans. In sentence-like lines (subtitles, the version meta line, status lines) only the length switches to Silkscreen; file names, status words, dates, and an inline "v4" stay sans.

## Layout

Every page sits in a centered column, 48rem wide with 16px side gutters, under a full-width header whose inner row shares the column. Page bodies start 24px below the header, except home's one-message screens (welcome, pending, rejected), which start 64px below; your tracks and the project pages leave 64px at the foot. Sections are 48px apart. The mini-player's inner row shares the column too.

The header is 56px tall: the wordmark, then the nav items stretched to the full height (12px side padding, 4px apart), then the account items pushed right. On phones the nav takes a 44px row of its own under the wordmark and account items, its first label lined up with the wordmark, since the sections no longer fit beside them.

The project page stacks a muted "Projects" back link, then the header: a top-aligned row of the page cover (96px square, 128px from `sm`) and, 16px across (24px from `sm`), a column holding the title, the description 8px under it, and the cover control 8px under that (a text-link button, so its label lines up with the title and nothing fills toward the cover). Long titles break inside the column rather than pushing the cover. 20px below the header comes one wrapping row (16px across, 12px down) of the release type picker, the privacy line, and Edit pushed right. A release type error wraps onto its own line at the end of the row. Under "Tracks" (with its count and total on the same baseline) the running order is a list on 1px rules, each row a grid: grip (1.75rem), number (2rem), title and subtitle (the rest), then the remove button. From `sm` the columns widen (2rem, 2.5rem), gaps go to 12px, and a 4rem right-aligned length column appears; on phones the length moves into the subtitle line instead. Titles clamp to two lines on phones and one from `sm`. The add-a-track picker sits 20px under the list.

In Edit mode the header gives way to a stack 32px apart: the "Edit project" H1, the form (fields 16px apart, Save and Cancel 12px apart), the release type row, the Cover art section (only when the project has a cover), and the Delete project section, last. Each of the last two opens with a 1px `rule` line 20px above its 1rem H2, then a muted line 4px below and its button 12px below that.

Your tracks (`/tracks`) stacks the "Your tracks" H1, the upload section 24px below, then "Tracks" 48px below that. The upload section is a muted line on privacy and formats, then (up to 36rem wide, 16px apart) the file picker, sized to its button and file name, then Title and the primary Upload on one row; the progress bar and any status or error line follow in the same stack. The track list uses the projects list's row pattern: title over subtitle on the left, and from `sm` the length column at the right (on phones the length moves into the subtitle line). Titles clamp to two lines on phones and one from `sm`. Newest and Older links sit 16px under the list. Signed out, the pitch is followed 32px below by Sign in (primary) and Create an account, 12px apart and wrapping. Pending and rejected are the H1 with a muted paragraph 12px below, and nothing else in the body.

The track page stacks a muted "Your tracks" back link (12px above the title), the H1 title, then the project 16px below, up to 28rem wide: a small muted "Project" label, the project as a link (or "Not in a project"), and a ghost Change button, 8px apart. Change swaps the row for the Project selector. The player follows 32px below, and the newest version's status line (processing, failed in `danger`, or upload not finished) sits 12px under it. "Feedback" comes 48px below (see Feedback), then "Versions" 48px below that, its list on 1px rules with 12px tall padding; each row is a grid (12px gaps, top-aligned) of the V-number (2.5rem, 3rem from `sm`), the notes column (the notes, the meta line 4px under them, and under a failed version its reason as a `danger` line), from `sm` a right-aligned 4rem length column (a muted "—" until there's a length; on phones the length rides in the meta line instead), and the Edit notes icon button. In edit mode the form takes the notes column and the length column stays where it was. The history leaves out versions whose file never arrived, except the newest. "Upload a new version" closes the page 48px below: the H2 and a muted line, then (up to 36rem wide, 16px apart) the file picker, the optional "What changed?" textarea, and the primary "Upload new version" on its own line, followed by the same progress bar and status or error lines as home.

The profile page is the H1, then 24px below it the Picture section (see Profile Picture), then 32px below that a form up to 36rem wide with fields 16px apart: Handle (optional), capped at 20rem from `sm`, with a muted line 8px under it that previews the page's address (a link to it once saved, "will be /@…" in `ink` while typing, or what a handle is for when empty); Name, with the name preview 8px under it; Bio (optional), a three-row textarea; City (optional), a select capped at 20rem from `sm` (full width on phones), its cities in native `optgroup`s by region (North America, Europe, Asia), alphabetical within each; then the primary Save with its status or error line 12px beside it, wrapping under it on narrow screens.

The projects list puts the new-project form (input and Create on one row, up to 28rem wide) under the intro, then rows on 1px rules, 12px tall padding, centred vertically: the 48px cover first, then (16px across) the title and description, and the fixed-width release type badge on the right, 16px from them. Descriptions clamp to two lines on phones and one from `sm`. The whole row is the link's hit area.

The track page player is two rows: the transport button and LCD readout side by side with a 12px gap, then a full-width waveform 12px below, all inside 12px of panel padding. The waveform is 96px tall, 128px from the `sm` breakpoint (640px).

The mini-player is stuck to the bottom of the viewport across the full width, with its inner row padded 8px by 16px. On phones it wraps: the button and title/time on one line, and the waveform (28px tall) across the full width below. From `sm` up it's one row: button, a 288px title column, and the waveform (36px tall) filling the rest.

The waveform's geometry is fixed in CSS pixels so it stays crisp at any width: each bar takes a 6px slot (4px bar, 2px gap), each segment 4px of height (3px lit, 1px gap), bars mirror around a center gap, and quiet tracks are scaled up by at most 4x so near-silence still reads as near-silence.

## Elevation & Depth

Depth belongs to the hardware. The page canvas and working screens are flat; separation there comes from 1px rules and solid `chrome-lo` fills. The player panel is raised, LCD windows (in the player, the release type picker, and the release type badge) are recessed, and the transport button is raised until pressed, when it sinks.

### Shadow Vocabulary

- **Panel** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.1), 0 2px 8px rgb(0 0 0 / 0.5)`): the player housing and mini-player bar.
- **LCD well** (`box-shadow: inset 0 2px 5px rgb(0 0 0 / 0.75), 0 1px 0 rgb(255 255 255 / 0.07), 0 0 0 2px #1d211f, 0 0 0 3px #555d58`): every LCD window: readout, waveform, release type picker, release type badge, A/B switch, upload progress bar. The lip ring takes 3px outside the box, so give the window a 3px margin where it meets other content.
- **Bevel** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.16), 0 1px 2px rgb(0 0 0 / 0.6)`): transport buttons at rest.
- **Bevel pressed** (`box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.65)`): transport buttons while pressed, with the gradient flipped.
- **Focus glow** (`box-shadow: 0 0 10px color-mix(in oklab, #a8f03f 55%, transparent)`): paired with the focus outline on links, buttons, nav items, the wordmark, the file picker, whole list rows, and the player's controls; also the primary button's hover.
- **Nav underline** (`box-shadow: inset 0 -2px 0 #a8f03f`): the current nav item's 2px accent underline. A line, not depth.

### Named Rules

**The Housed Hardware Rule.** Shadows describe hardware: raised housing, recessed LCD windows, buttons that sink. Beyond those, only the focus glow and the nav underline use a shadow. Working-screen controls, rows, and sections get none.

**The Bare Art Rule.** Cover art is the artist's own image and brings its own colour, so it sits bare: square, 0.25rem corners, a 1px `rule` edge, and a `chrome-lo` backing that only shows while it loads or when there's no cover. No panel chrome, LCD well, bevel, shadow, or gradient around it, and nothing drawn over it.

## Shapes

Small, firm corners: 0.5rem on the track page's panel; 0.375rem on transport buttons, working buttons, and fields; 0.25rem on LCD windows, project covers, the dragged row, and the focus area of links, nav items, and whole list rows; 2px on segments inside the release type picker and A/B switch and on the upload bar's track. List rows are square. The mini-player bar is square and drops its side and bottom borders, keeping only the top edge. Every hardware surface has a 1px `chrome-edge` outline; every working control a 1px `field-edge` one; a project cover a 1px `rule` one. Covers are always square: the image fills the square and is cropped to it.

Icons are filled and square-cornered on a 24-unit grid, drawn in the same hand as the transport button's play and pause: grip (two columns of three squares), a down chevron, a cross for remove, a pencil for editing notes, a square-shouldered bell for notifications, a square head over shoulders for a person (the header's Profile until you have a picture, and anyone without one), and a square-headed eighth note on an empty cover (20px in a list, 32px on the page). They're 18px by default, inline SVG in `currentColor`, and decorative; the button around each carries the label (the cover's note has no button, and the project title beside it says what it is).

## Components

### Transport Button

Chunky and tactile. A square bevel button with a graphite gradient (`button-hi` to `button-lo`), a 1px edge, and an inline SVG play or pause icon.

- **Sizes:** 56px with a 22px icon (track page), 44px with an 18px icon (mini-player).
- **Rest:** `ink` icon, bevel shadow.
- **Hover:** icon turns `accent`.
- **Pressed:** gradient flips and the bevel-pressed shadow makes it sink.
- **Playing or loading:** shows pause with an `accent` icon; loading sets `aria-busy`.
- **Focus:** 2px `accent` outline, 2px offset, plus the focus glow.

### Buttons

Flat and plain: the working counterpart of the transport button. Solid graphite with no gradient, because they carry text.

- **Shape:** 0.375rem corners, at least 40px tall, 16px side padding, 8px between icon and text, label text (0.875rem, 500), never wrapping.
- **Default:** `chrome-lo` fill, 1px `field-edge` edge, `ink` text. Hover turns text and edge `accent`.
- **Primary:** the one primary action in a form or screen (Create, Save, Add, Upload, Upload new version, and Sign in on the welcome): `accent` fill and edge with `canvas` text. Hover keeps the fill and adds the focus glow, so it never turns `lcd-ink`.
- **Danger:** destructive actions only (Delete project): `danger` text and edge, filling solid `danger` with `canvas` text on hover. Its wording is plain and literal.
- **Ghost:** repeated row actions: `muted`, transparent, no edge until hover gives it the `chrome-lo` fill and `field-edge` edge.
- **Icon:** a 40px square for icon-only buttons (ghost in the track rows and version rows), always with an `aria-label`.
- **Focus:** 2px `accent` outline, 2px offset, plus the focus glow.
- **Disabled:** `muted` text and a `rule` edge (primary drops to the `chrome-lo` fill; ghost buttons go `chrome-hi` with no edge), not-allowed cursor. Pending buttons say what's happening ("Saving…").

### Links

Text links on styled surfaces: `ink`, underlined in `field-edge` with a 3px offset; hover turns text and underline `accent`. Focus is the accent outline and glow. Back links and Sign out sit in `muted`. A disabled link-styled button stays `muted` on hover, since it can't be used.

### Inputs / Fields

- **Style:** `chrome-lo` fill, 1px `field-edge` edge, 0.375rem corners, 8px by 12px padding, at least 40px tall, body-size `ink` text, `muted` placeholder. Full width by default; labels sit above in small 500 sans. Textareas are the same field, three rows tall.
- **Focus:** 2px `accent` outline at no offset, and the edge turns `accent`.
- **File picker:** the native input sized to its content, its file name in small `muted` text, and its button drawn like a default button (`chrome-lo`, 1px `field-edge` edge, 0.375rem corners, 40px tall, `ink` 500 text; text and edge `accent` on hover). Focus is the accent outline and glow around the whole input. Disabled while uploading, its button takes the buttons' disabled treatment: a `rule` edge, `muted` text, and a not-allowed cursor.
- **Dropping a file:** the whole audio upload form (your tracks and the track page's new version) takes a dropped file, and its description ends "Choose a file or drop one here." While a file is dragged over it, a 2px dashed `accent` outline with 0.5rem corners rings the form 12px outside its content (nothing moves). A drop picks the first file as if chosen, filling the title on your tracks; Upload still sends it. A file that isn't supported shows the error line at once. Text or links dragged over do nothing, and so does a drop while uploading. Cover art doesn't take drops.
- **Select:** the same field with the native arrow removed and an 18px `muted` down chevron drawn 12px from the right (40px of right padding clears it). Option groups name what choosing from them does ("In another project (moves it here)"). The track page's Project selector (opened by Change) puts the select (its first option "Not in a project", focused on open) and default Move and Cancel buttons on one row, 8px apart, under a "Project" label; a failed move shows a `danger` line 8px under the row. Escape or Cancel closes it, a successful move closes it, and focus goes back to Change.
- **Errors:** a small `danger` line under the form, announced as an alert. Progress notes ("Upload complete. Starting processing…") are a small `muted` status line in the same place.

### Name Preview

Under the profile's Name field, a small `muted` line shows how the name signs a comment as you type: "On comments:", the name in `ink` at 500 (long names break rather than widen the line), a muted " · ", and a sample time "1:23" in LCD Figure Small, `ink`. It's the field's description for screen readers, and isn't live, so typing doesn't announce. With no name it reads "Add a name so people know who left a comment." With a picture, it sits between "On comments:" and the name, 20px square (see Profile Picture). It's a preview, not a commitment to the comment byline's final look; when comments ship, the two must match.

### Profile Picture

Above the profile form, and saved on its own (it doesn't wait for Save): a small 500 "Picture" label with a muted "(optional)", then 8px below, an 80px square picture with 0.25rem corners and a 1px `rule` edge, the same treatment as a project cover. With no picture it's a `chrome-lo` square holding a 32px `field-edge` person icon (a square head over square shoulders, in the icons' filled, square-cornered hand). Beside it, 16px away: a default "Upload a picture" button (or "Change picture" once there is one, then a ghost "Remove", 8px apart, wrapping on phones), and under them a muted line on accepted types and that the image is cropped square with photo details like location removed. Upload progress (capped at 20rem), the muted "Processing your picture…" status, or a `danger` error line sit 12px under the row. Removing has no confirm: it's undone by uploading again.

**Save status.** "Saved." (muted, a status) or a failed save (`danger`, an alert) sits beside Save and disappears as soon as the form changes again, so it never describes an edit that wasn't saved.

### Navigation

The app header: a flat `canvas` bar with a `rule` line under it, 56px tall. The wordmark leads in Silkscreen `lcd-ink` and links home, which is the feed once signed in (it takes `aria-current="page"` there, with no underline). Nav items (Tracks, Projects) are small 500 sans, `muted` at rest, `accent` on hover; the current one is `ink` with the 2px accent underline and `aria-current="page"`. Notifications (an 18px square-shouldered bell), Profile (approved accounts only; your picture, or the person icon until you have one) and Sign out (or Sign in when signed out) sit muted at the right, 16px apart. The bell is labelled "Notifications" (with a matching hover title), turns `accent` on hover, and carries the unread count after it in LCD Figure `accent` ("99+" past 99, and "9+" past 9 on phones), which its label says to screen readers. Profile is labelled "Profile" (with a matching hover title): your picture at 24px, square with 0.25rem corners and a 1px `rule` edge like every picture (its edge turns `accent` on hover), or the 18px person icon, which turns `accent` on hover like the bell. On phones the bell and Profile drop their 4px side padding, the gaps tighten to 12px, the nav drops to its own row with its items' sides at 8px, and an approved account's Sign out moves to the foot of the profile page (a default button on a `rule` line, phones only). Signed-in accounts that aren't approved (pending or rejected) get no nav: just the wordmark and Sign out, which is the only Sign out on those screens. Every item takes the accent outline and glow on focus.

### LCD Readout

A recessed LCD window (`lcd` background, 1px edge, 0.25rem corners, LCD well shadow) padded 6px by 12px. It holds the elapsed time in phosphor lime over ghost "8"s, "/ total" in cyan, and the version and state word in small uppercase cyan, pushed to the right.

### Waveform Window

The signature component of the player: the same LCD window, used as a keyboard-accessible slider. It draws segmented mirrored bars (see Layout), with lit, dim, and unlit segments and a 2px cyan playhead that appears once playback has moved past zero. Pointer down seeks, dragging previews and seeks on release, arrow keys step 5 seconds, Page Up/Down 30, Home/End jump to the ends, and Space plays or pauses. Focus uses the same accent outline and glow. It has no animation.

### Player Panel

The track page's housing: graphite gradient, 1px edge, panel shadow, 0.5rem corners, 12px padding, with the transport button, LCD readout, and waveform window inside, and the A/B switch under the waveform when the track has more than one ready version. An error line in `danger` sits under the waveform on a solid `chrome-lo` strip, never on the gradient.

### Mini-Player

A solid `chrome-lo` bar (no gradient, since it carries text) with a 1px `chrome-edge` top border and the panel shadow, stuck to the bottom of every page once something has played. It holds the 44px transport button, the track title (sans, links to the track page, hover `accent`) above an LCD-face time line in lime and cyan, and a compact waveform window. An error replaces the time line in `danger`.

### Release Type Picker

The project page's signature: what kind of release the project is (Single, EP, Album, Compilation, new projects start as Single) as a row of segments in one LCD window, padded 4px with 4px between segments. Each segment is an uppercase LCD label, 6px by 12px (16px sides from `sm`), with 2px corners. The chosen type is a solid `lcd-ink` fill with `lcd` text, and the others are `lcd-unlit`, turning `accent` on hover. The types aren't steps, so nothing before the chosen one is lit. It's a radio group: arrow keys move along it, each choice saves at once, and keyboard focus draws the 2px accent outline at 2px offset around the segment. A failed save puts the type back and says so in a `danger` line.

### A/B Switch

Compares the current version (A) with an older one (B) in the player panel. It uses the release type picker's segments in one LCD window: two segments labelled like "A · v3" and "B · v2". The version in the player is the solid `lcd-ink` fill, the other is `lcd-unlit`, and hover turns it `accent`. It's a radio group, so arrow keys flip it, and so do the A and B keys anywhere in the panel. Switching carries on at the same moment, playing or paused as before. With two or more older versions, a compact field-style select labelled "Compare with" sits beside it (and wraps below it on phones) to pick B.

### Sharing Section

The track and project pages' privacy settings, in a section headed "Sharing" (H2; on the project page, linked from the "Sharing" link at the end of the privacy line under the title). It's a working screen with no hardware: plain words, flat controls, nothing playful (CLAUDE.md section 9: privacy UI stays clear and serious). "Who can listen" is a radio list, each choice a label over a muted one-line explanation (native radios in `accent`, 16px, 12px apart), with a working Save button disabled until the choice changes, and a muted "Saved." or `danger` error beside it. "Share links" (H3) follows 40px below: a muted line on what a link opens (listening, and commenting for signed-in holders), a "Stops working" select, then a primary button. On something private, a plain line says links don't work yet and that making one changes the setting, and the button says so too ("Allow link access and make a link"). A new link shows once in a read-only monospace field with a Copy button and a muted "Copy it now" line. Working links are rows on 1px rules (when it was made, then a muted line of when it stops working) with a "Turn off" button that asks first, inline, with a `danger` "Turn off" and Cancel. Turned off and expired links sit under a closed "Turned off or expired (n)" disclosure.

### Release Type Badge

The release type at list size: a fixed 7.5rem LCD window padded 4px by 8px, with the type centred in uppercase `lcd-ink` ("Compilation", the longest, still fits). The fixed width keeps badges aligned down the list. Screen readers hear "Release type:" before the word.

### Project Cover

The project's art, shown bare (see the Bare Art Rule). A square image, cropped to fill, with 0.25rem corners, a 1px `rule` edge, and a `chrome-lo` backing. Two sizes: 48px leading each projects-list row, and 96px (128px from `sm`) beside the title on the project page. With no cover it's the same square in solid `chrome-lo` with the `rule` edge and a centred filled note in `field-edge` (20px in the list, 32px on the page). The image is a plain `img` from a short-lived signed URL. Its alt is empty in list rows, since the title sits beside it, and "Cover art for <title>" on the project page.

**Cover control.** Under the description in view mode: a small `muted` text-link button, "Add cover art" (or "Change cover art" once there is one), 40px tall for touch with no fill, with 4px side padding taken back by a 4px negative margin (the label stays on the column edge and the focus ring clears it evenly), that opens the file picker; the native input stays hidden and out of the tab order. The parts stack 8px apart. While the image goes up, the Upload Progress bar shows, capped at 20rem; while the worker crops and cleans it, a small `muted` status line says so in plain words ("Processing the cover art. It's cropped square and cleaned of photo details like location."); a wrong type, a file that's too large, or a failed image is a small `danger` alert line, up to 65ch. The button is disabled while uploading or processing.

**Remove cover.** In Edit mode, only when there's a cover: a section on a `rule` line with a 1rem "Cover art" H2, the current cover as a 48px thumbnail beside a `muted` line saying it takes the cover off and another can be added any time, and a default (not danger) "Remove cover art" button, since nothing is lost. It reads "Removing…" while pending, and a failure is a `danger` line above the button.

### Upload Progress

Your tracks' signature while a file goes up, used the same way for a new version on the track page and, capped at 20rem wide, for cover art on the project page: a `progressbar` labelled "Uploading", built as an LCD window (3px margin for its lip) padded 8px by 12px. Inside, a 12px track with 2px corners shows still unlit stripes, and the done part fills it with lit stripes: 45° bands 6px wide in `lcd-ink` and `lcd-dim`. The percent reads out at the right in LCD Figure (`lcd-ink`, 3rem wide, right-aligned); it is hidden from screen readers, which get the value from the bar. It appears only while uploading and while processing starts (held at 100%), and the form's fields are disabled meanwhile.

The lit stripes drift sideways (one 16.97px tile every 0.8s, linear) while it's shown: the one ambient motion in the system, and it exists only to say work is in progress. Under `prefers-reduced-motion` they hold still.

### List Rows

Lists are rows on 1px `rule` lines (a rule above the first and under each), never cards. On your tracks and the projects list, rows are 12px tall padding, lift to a 60% `chrome-lo` fill on hover, and the title (body size, 500, `ink`, `accent` on hover, no underline) is the row's link with its hit area stretched over the whole row. Keyboard focus draws the 2px `accent` outline at 2px offset, with 0.25rem corners and the focus glow, around the whole row rather than the title. Home's track rows carry the same subtitle and LCD length as the project page's track rows. Empty lists say what to do next on the same rules, in `muted`.

### Track Row

One row of a project's running order (see Layout for the grid): a drag grip (a button: `field-edge`, `accent` on hover, focus, and while dragging), the two-digit LCD number, the title link (an ununderlined link, focus around the title only, since the row holds its own buttons) over a subtitle of the version and any non-ready state (in `danger` when failed), the LCD length, and a ghost icon button for remove. While dragged, the row lifts above its neighbours with a `chrome-lo` fill, 0.25rem corners, and a 2px `accent` outline, and follows the pointer; neighbours swap as it crosses their midpoints. The grip is also the keyboard and screen-reader path: focused, the up and down arrows move the track one place and the grip keeps focus as the row moves. Its label gives the position ("Reorder Night drive, position 2 of 5"), and a polite live region says where the track landed. A removed track leaves a same-height `chrome-lo` slot saying it's still in your tracks, with an Undo link that takes focus.

### Feedback

The comments on the version in the player (A or B: switching sides switches the comments), on the track page and the listen page, in a section headed "Feedback" (H2) with a small muted count line under it ("On v3: 2 open, 1 resolved." or "No comments on v3 yet."). It's a working screen: the player stays the page's one piece of hardware.

- **What the artist wants feedback on:** above the comment box, 24px over it. When the version has a prompt it's a single box up to 36rem wide (`chrome-lo` fill, 1px `rule` edge, 0.375rem corners, 12px by 16px padding): a small 500 `muted` lead ("The artist wants feedback on", or "You asked for feedback on" for the artist), the prompt in `ink` with its line breaks kept, and for the artist a ghost Edit. With no prompt, the artist gets a default "Ask for specific feedback" button and listeners see nothing. Editing works like the notes editor: "What do you want feedback on in v3?", the field, Save and Cancel, Escape cancels, focus returns to the button.
- **Can't comment:** on the listen page, in the comment box's place. Signed out: a default "Sign in to comment" button (Clerk's sign-in as a modal, so the page and the link stay put) and, 16px across, a muted "You can listen and read without an account." Waiting for approval: a muted line saying they can comment once it's approved.
- **Comment box:** up to 36rem wide: a small 500 label "Comment on v3", the three-row field ("What do you hear?"), then one wrapping row of the primary "Comment" button and, 16px across, a checkbox "At 1:23" (the time in LCD Figure Small). While the box is empty the time follows the playhead; it holds still from the first keystroke, so the comment lands where you were listening. Unticked, it's a general comment. With the version not in the player there's no moment, and a muted line says "Play it to pin your comment to a moment." Cmd or Ctrl+Enter posts. The parts stack 12px apart, with any error as a `danger` line.
- **Threads:** rows on 1px rules (a list 24px under the box), each a grid of a 3.5rem moment column and the comment, 12px apart. The moment is the LCD figure ("0:23", `ink`, `accent` on hover, no underline), a button that plays the version from there; a general comment shows a muted "—". The comment is a byline (the 20px picture, the name at 500 in `ink`, or a muted "Someone" with no name; with a handle, the name links to its public page, `accent` on hover, no underline, and reads "@handle" if there's no name; then the muted date, and on a resolved thread the LCD Label "RESOLVED" in `muted`), the words in `ink` with their line breaks kept, and a row of ghost buttons narrowed to 8px sides (Reply, Resolve or Reopen, Edit, Delete), shown only when the API says the asker may. A resolved thread's words go `muted`, replies included. Replies sit under the comment, 8px down, behind a 1px `rule` line on the left with 16px of padding, 12px apart, the same byline, words and actions (no Reply or Resolve). A deleted comment that still has replies keeps its row and moment and reads "This comment was deleted." in `muted`.
- **Editing, replying, deleting:** in place, like the notes editor. Edit swaps the words for the field with Save (primary) and Cancel; Reply opens a two-row "Your reply" field with Reply (primary) and Cancel under the last reply; Escape cancels either. Delete asks first, inline: "Delete this comment? This can't be undone." with a `danger` Delete and Cancel. Pending buttons say what's happening ("Posting…", "Saving…", "Replying…", "Deleting…").
- **Markers:** a 24px rail under the waveform (inside the player panel, 4px below the window) with a tick at each pinned comment of the version shown: 4px by 12px with 1px corners, `accent` for open and `field-edge` for resolved, `accent` on hover, each in a 24px hit area centred on its moment. Clicking one scrolls its thread into view (no smooth scrolling) and lights it like the version in the player: a `chrome-lo` fill bleeding 12px into the gutter with a 2px `accent` bar on its left edge, until another is picked. The rail is a pointer shortcut, hidden from screen readers and out of the tab order; the thread list's moments are the keyboard path.

### Version Row

One row of a track's version history (see Layout for the grid), read like a track listing: the LCD V-number in `ink`, then the artist's change notes, then the meta line ("night-drive-v3.wav · October 13, 2026", see Typography), the LCD length in its own right-aligned column from `sm` (so lengths line up down the history, like a J-card), and a 40px ghost icon button with the pencil (`aria-label` "Edit notes for v3"). Under a failed version, its reason is a small `danger` line. Rows sit on 1px `rule` lines with no hover fill, since the row isn't a link. The version in the player (playing or paused, so A/B switching shows which one you're hearing) is lit: a `chrome-lo` fill that bleeds 12px into the gutter, a 2px `accent` bar on its left edge, and its V-number in `accent`; it carries `aria-current` and screen readers hear "Now playing" (or "In the player" when paused) before it. It's an unordered list: the V-number is the order, and failed uploads leave gaps in it.

**Notes editor.** The pencil turns the notes into a form in place: the meta line first (the version's facts stay on top), a "What changed in v3?" label, the textarea (focused on open), any save error as a `danger` line, then Save (primary) and Cancel (default) 8px apart, closing the form; the parts stack 12px apart. Escape cancels (except while a save is under way), and on save or cancel focus returns to the pencil. While saving, both buttons are disabled and Save reads "Saving…".

## Do's and Don'ts

### Do:

- **Do** build new styled surfaces from the tokens and utilities in `app/globals.css`, never one-off hex values.
- **Do** keep the LCD's unlit state visible: ghost "8"s behind digits, `lcd-cell` behind the waveform, `lcd-unlit` for segments not chosen.
- **Do** use `accent` for focus on every themed control: a 2px outline at 2px offset plus the glow on buttons and links, at no offset with an accent edge on fields.
- **Do** keep everything still: no marquees, visualizers, or animated effects. The only motion is a dragged row following the pointer and the upload bar's stripes drifting while an upload or processing start is in progress; both stay still at rest, and the stripes stop under reduced motion. Neither is a license to animate anything else.
- **Do** put text on a solid backing (`canvas`, `chrome-lo`, or `lcd`), never on a gradient (CLAUDE.md section 9).
- **Do** keep working-screen controls flat graphite with a 1px `field-edge` edge, and save the LCD well for things that read out.
- **Do** separate list rows with 1px `rule` lines, and when the title is the row's link, put keyboard focus around the whole row.
- **Do** keep privacy and destructive UI plain: literal wording, `danger` only for destructive actions, and a confirmation that says what stays and that it can't be undone.
- **Do** check CLAUDE.md section 9 for the direction of any surface not recorded here, and record it here once it ships.

### Don't:

- **Don't** set titles, labels, buttons, errors, or body text in Silkscreen.
- **Don't** use `lcd-cyan` or `lcd-ink` for buttons or links; interaction color is `accent`.
- **Don't** put a gradient, bevel, or shadow on working-screen controls, rows, or sections; those belong to player hardware and LCD windows.
- **Don't** wrap list items in cards; use rows on rules.
- **Don't** house cover art in chrome, an LCD well, a bevel, a shadow, or a gradient, or draw over it; it sits bare with a 1px `rule` edge.
- **Don't** style the sign-in and sign-up bodies until the owner asks; they stay plain semantic HTML.
- **Don't** copy Winamp, LimeWire, Microsoft, or Apple names, logos, skins, or assets.
