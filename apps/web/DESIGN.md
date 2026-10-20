---
name: Feedback
description: A Winamp-era hardware player for unfinished music, extended to flat graphite working screens. Styled so far are the player, the app header, and the project pages.
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
  status-segment:
    textColor: '{colors.lcd-unlit}'
    typography: '{typography.lcd-label}'
    rounded: '{rounded.segment}'
    padding: '6px 12px'
  status-segment-passed:
    textColor: '{colors.lcd-ink}'
  status-segment-current:
    backgroundColor: '{colors.lcd-ink}'
    textColor: '{colors.lcd}'
  status-badge:
    backgroundColor: '{colors.lcd}'
    textColor: '{colors.lcd-ink}'
    typography: '{typography.lcd-label}'
    rounded: '{rounded.sm}'
    padding: '4px 8px'
    width: '7.5rem'
  track-row-dragging:
    backgroundColor: '{colors.chrome-lo}'
    rounded: '{rounded.sm}'
---

# Design System: Feedback

## Overview

**Creative North Star: "The Hardware Player"**

Feedback borrows the late-90s desktop music player: a graphite hardware housing, a recessed LCD window with lime phosphor ink, and chunky bevel buttons that sink when pressed. The waveform sits inside the LCD as segmented bars. The part you've already heard is lit, the rest shows as dim lime, and the empty cells stay faintly visible behind both, like the unlit segments on a real LCD.

**Scope so far: the player, the app header, and the project pages.** The player means the track page's waveform player and the global mini-player. The app header sits on every page. The projects list (`/projects`) and the project page (`/projects/[projectId]`) are the first working screens: the player's world extended to forms and lists, with flat graphite controls, 1px rules between rows, and the LCD well kept for things that read out (the status meter and status badge). Every page uses the same 48rem column under the header, but the bodies of home, sign-in, sign-up, and the track page (apart from its player) are still deliberately plain semantic HTML, and so is the track page's Project selector. The direction for everything not built yet (glossy LimeWire toolbars, results tables, striped progress bars, window panels, Aqua surfaces, light mode, skins) is in CLAUDE.md section 9, "Visual style: Y2K / Winamp / LimeWire". It is not recorded here because none of it exists in code. When one of those surfaces gets built, add it to this file from the shipped code.

The system is quiet and practical: dark only, no decorative motion, and one bright signature per screen (the lit LCD of the player, or the status meter on a project). All tokens live in `app/globals.css` under `@theme`, and components use them, never one-off hex values.

**Key Characteristics:**

- Graphite chrome housing on the player, raised by a 1px top highlight and a soft drop.
- Recessed deep green-black LCD windows set into their surroundings with a dark lip and a faint outer highlight.
- Lit, dim, and unlit segments: the LCD always shows its unlit state.
- Working screens are flat: solid graphite controls with a 1px edge, lists on 1px rules, no cards and no gradients behind text.
- Lime for content inside the LCD, a slightly different lime for interaction, cyan for secondary player readouts and the playhead.
- Bitmap face for readouts, figures, and the wordmark; clean system sans for everything else.
- No animation anywhere; the only motion is a dragged row following the pointer.

## Colors

A green-tinted near-black world: graphite chrome, a deeper green-black LCD, lime phosphor, and a cyan second channel.

### Primary

- **Phosphor Lime** (`lcd-ink`): what displays. The elapsed time, played waveform segments, the time in the mini-player, passed and current status segments (the current one as a solid fill with `lcd` text), the status badge's lit pips and word, and the header wordmark. 14.5:1 on the LCD.
- **Signal Lime** (`accent`): interaction. The focus outline and glow, the hover color of buttons, links and nav items, the current nav item's underline, the dragged row's outline, the transport icon while playing or loading, the text-selection background (with `canvas` text), the caret, and native control accents. It is also the fill of the one primary button in a form, with `canvas` text (14:1).

### Secondary

- **LCD Cyan** (`lcd-cyan`): the second LCD channel, in the player only. The playhead (a 2px bar), "/ total" time, and the version plus state word (Stopped, Loading, Playing, Paused, Error). 12.5:1 on the LCD.

### Tertiary

- **Soft Coral** (`danger`): error lines (playback, forms, saves) set in body sans, never in the LCD, and the destructive button's text and edge, filling solid with `canvas` text on hover (8.5:1 either way).

### Neutral

- **Green Black** (`canvas`): the page background, and the header's.
- **Pale Mint Ink** (`ink`): body text, titles, button text, and the transport icon at rest. 15.9:1 on the canvas.
- **Sage Grey** (`muted`): secondary text: descriptions, counts, the privacy line, track subtitles, track numbers, placeholders, inactive nav items, ghost buttons, and Sign out. 7.6:1 on the canvas, 6.4:1 on `chrome-lo`.
- **Hairline** (`rule`): 1px lines between list rows, above and below lists, under the header, and above the delete section; the edge of a disabled button.
- **Field Edge** (`field-edge`): the 1px edge of inputs and buttons, link underlines at rest, the drag grip at rest, and the scrollbar thumb. 4.4:1 on the canvas and 3.7:1 on `chrome-lo`, above the 3:1 non-text minimum.
- **Graphite High / Low** (`chrome-hi` / `chrome-lo`): the panel gradient, top to bottom. `chrome-lo` alone is the solid fill of the mini-player, every working button and field, the dragged row, the removed-track slot, and list-row hover (at 60%); it also forms the dark lip around each LCD window. `chrome-hi` is the icon color of a disabled ghost button.
- **Chrome Edge** (`chrome-edge`): the 1px near-black outline on panels, LCD windows, and transport buttons.
- **Chrome Lip** (`chrome-lip`): the faint outer ring that makes an LCD window look set in.
- **Button High / Low** (`button-hi` / `button-lo`): the transport button gradient, flipped when pressed.
- **LCD Black** (`lcd`): the LCD window background.
- **Dim Phosphor** (`lcd-dim`): waveform segments still to play.
- **Unlit Cell** (`lcd-cell`): every possible waveform segment, drawn behind the bars, and the status badge's unlit pips.
- **Ghost Segment** (`lcd-ghost`): the unlit "8" behind each LCD digit.
- **Unlit Label** (`lcd-unlit`): status segments still ahead: unlit, but readable as words. 6:1 on the LCD.

### Named Rules

**The Lit and Unlit Rule.** The LCD always shows its unlit state: played audio is `lcd-ink`, audio still to play is `lcd-dim`, empty cells are `lcd-cell`, and every digit sits over a ghost "8" in `lcd-ghost`. Status stages work the same way: passed stages lit in `lcd-ink`, the current one solid `lcd-ink`, later ones in `lcd-unlit` (words must stay readable, so they don't drop to `lcd-cell`); the badge's pips are lit or `lcd-cell`. Never draw LCD content on a blank window.

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
- **LCD Figure** (400, 0.875rem, tabular): figures in a list, set straight on the canvas: two-digit track numbers in `muted`, track lengths in `ink` (a muted "—" when there's none), and the project's total length in the "Tracks" count line.
- **LCD Label** (400, 0.75rem): the time line in the mini-player, the version and state word on the track player, and the status segment and badge words (uppercase on the last three).
- **Headline** (600, 1.875rem): the page H1 ("Projects", the project title, "Edit project"), balanced when it wraps.
- **Section Title** (600, 1.125rem): H2s ("Your projects", "Tracks"); the delete section's H2 drops to 1rem.
- **Title** (500, 0.875rem): the track title link in the mini-player. List titles use body size at 500.
- **Body** (400, 1rem): page text, field text, and the confirmation sentence; descriptions run in `muted` at 65ch. Small text (0.875rem) carries form labels (500), counts, subtitles, the privacy line, and errors; the mini-player's error is 0.75rem.

### Named Rules

**The Bitmap for Readouts Rule.** Silkscreen is for readouts and figures: times, lengths, totals, track numbers, version numbers, state and stage words, and the wordmark. Titles, labels, buttons, errors, forms, comments, and body text use the sans.

## Layout

Every page sits in a centered column, 48rem wide with 16px side gutters, under a full-width header whose inner row shares the column. Page bodies start 24px below the header; the project pages leave 64px at the foot. Sections are 48px apart. The mini-player's inner row shares the column too.

The header is 56px tall: the wordmark, then the nav items stretched to the full height (12px side padding, 4px apart), then the account link pushed right.

The project page stacks a muted "Projects" back link, the title and description, then one wrapping row (16px across, 12px down) of the status meter, the privacy line, and Edit pushed right. A status error wraps onto its own line at the end of the row. Under "Tracks" (with its count and total on the same baseline) the running order is a list on 1px rules, each row a grid: grip (1.75rem), number (2rem), title and subtitle (the rest), then the move and remove buttons, 8px apart. From `sm` the columns widen (2rem, 2.5rem), gaps go to 12px, and a 4rem right-aligned length column appears; on phones the length moves into the subtitle line instead. Titles clamp to two lines on phones and one from `sm`. The add-a-track picker sits 20px under the list.

The projects list puts the new-project form (input and Create on one row, up to 28rem wide) under the intro, then rows on 1px rules, 12px tall padding: title and description on the left, the fixed-width status badge on the right. Descriptions clamp to two lines on phones and one from `sm`. The whole row is the link's hit area.

The track page player is two rows: the transport button and LCD readout side by side with a 12px gap, then a full-width waveform 12px below, all inside 12px of panel padding. The waveform is 96px tall, 128px from the `sm` breakpoint (640px).

The mini-player is stuck to the bottom of the viewport across the full width, with its inner row padded 8px by 16px. On phones it wraps: the button and title/time on one line, and the waveform (28px tall) across the full width below. From `sm` up it's one row: button, a 288px title column, and the waveform (36px tall) filling the rest.

The waveform's geometry is fixed in CSS pixels so it stays crisp at any width: each bar takes a 6px slot (4px bar, 2px gap), each segment 4px of height (3px lit, 1px gap), bars mirror around a center gap, and quiet tracks are scaled up by at most 4x so near-silence still reads as near-silence.

## Elevation & Depth

Depth belongs to the hardware. The page canvas and working screens are flat; separation there comes from 1px rules and solid `chrome-lo` fills. The player panel is raised, LCD windows (in the player, the status meter, and the status badge) are recessed, and the transport button is raised until pressed, when it sinks.

### Shadow Vocabulary

- **Panel** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.1), 0 2px 8px rgb(0 0 0 / 0.5)`): the player housing and mini-player bar.
- **LCD well** (`box-shadow: inset 0 2px 5px rgb(0 0 0 / 0.75), 0 1px 0 rgb(255 255 255 / 0.07), 0 0 0 2px #1d211f, 0 0 0 3px #555d58`): every LCD window: readout, waveform, status meter, status badge. The lip ring takes 3px outside the box, so give the window a 3px margin where it meets other content.
- **Bevel** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.16), 0 1px 2px rgb(0 0 0 / 0.6)`): transport buttons at rest.
- **Bevel pressed** (`box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.65)`): transport buttons while pressed, with the gradient flipped.
- **Focus glow** (`box-shadow: 0 0 10px color-mix(in oklab, #a8f03f 55%, transparent)`): paired with the focus outline on links, buttons, nav items, the wordmark, and the player's controls.
- **Nav underline** (`box-shadow: inset 0 -2px 0 #a8f03f`): the current nav item's 2px accent underline. A line, not depth.

### Named Rules

**The Housed Hardware Rule.** Shadows describe hardware: raised housing, recessed LCD windows, buttons that sink. Beyond those, only the focus glow and the nav underline use a shadow. Working-screen controls, rows, and sections get none.

## Shapes

Small, firm corners: 0.5rem on the track page's panel; 0.375rem on transport buttons, working buttons, and fields; 0.25rem on LCD windows, the dragged row, and the focus area of links and nav items; 2px on status segments inside the meter. List rows are square. The mini-player bar is square and drops its side and bottom borders, keeping only the top edge. Every hardware surface has a 1px `chrome-edge` outline; every working control a 1px `field-edge` one.

Icons are filled and square-cornered on a 24-unit grid, drawn in the same hand as the transport button's play and pause: grip (two columns of three squares), up and down chevrons, and a cross for remove. They're 18px by default, inline SVG in `currentColor`, and decorative; the button around each carries the label.

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
- **Primary:** the one primary action in a form (Create, Save, Add): `accent` fill and edge with `canvas` text. Hover keeps the fill and adds the focus glow, so it never turns `lcd-ink`.
- **Danger:** destructive actions only (Delete project): `danger` text and edge, filling solid `danger` with `canvas` text on hover. Its wording is plain and literal.
- **Ghost:** repeated row actions: `muted`, transparent, no edge until hover gives it the `chrome-lo` fill and `field-edge` edge.
- **Icon:** a 40px square for icon-only buttons (ghost in the track rows), always with an `aria-label`.
- **Focus:** 2px `accent` outline, 2px offset, plus the focus glow.
- **Disabled:** `muted` text and a `rule` edge (primary drops to the `chrome-lo` fill; ghost icons go `chrome-hi`), not-allowed cursor. Pending buttons say what's happening ("Saving…").

### Links

Text links on styled surfaces: `ink`, underlined in `field-edge` with a 3px offset; hover turns text and underline `accent`. Focus is the accent outline and glow. Row-title links drop the underline and stretch their hit area over the whole row. Back links and Sign out sit in `muted`.

### Inputs / Fields

- **Style:** `chrome-lo` fill, 1px `field-edge` edge, 0.375rem corners, 8px by 12px padding, at least 40px tall, body-size `ink` text, `muted` placeholder. Full width by default; labels sit above in small 500 sans.
- **Focus:** 2px `accent` outline at no offset, and the edge turns `accent`.
- **Select:** the same field with the native arrow removed and an 18px `muted` down chevron drawn 12px from the right (40px of right padding clears it). Option groups name what choosing from them does ("In another project (moves it here)").
- **Errors:** a small `danger` line under the form, announced as an alert.

### Navigation

The app header: a flat `canvas` bar with a `rule` line under it, 56px tall. The wordmark leads in Silkscreen `lcd-ink`. Nav items (Tracks, Projects) are small 500 sans, `muted` at rest, `accent` on hover; the current one is `ink` with the 2px accent underline and `aria-current="page"`. Sign out (or Sign in when signed out) is a small link at the right, muted when signed in. Every item takes the accent outline and glow on focus.

### LCD Readout

A recessed LCD window (`lcd` background, 1px edge, 0.25rem corners, LCD well shadow) padded 6px by 12px. It holds the elapsed time in phosphor lime over ghost "8"s, "/ total" in cyan, and the version and state word in small uppercase cyan, pushed to the right.

### Waveform Window

The signature component of the player: the same LCD window, used as a keyboard-accessible slider. It draws segmented mirrored bars (see Layout), with lit, dim, and unlit segments and a 2px cyan playhead that appears once playback has moved past zero. Pointer down seeks, dragging previews and seeks on release, arrow keys step 5 seconds, Page Up/Down 30, Home/End jump to the ends, and Space plays or pauses. Focus uses the same accent outline and glow. It has no animation.

### Player Panel

The track page's housing: graphite gradient, 1px edge, panel shadow, 0.5rem corners, 12px padding, with the transport button, LCD readout, and waveform window inside. An error line in `danger` sits under the waveform on a solid `chrome-lo` strip, never on the gradient.

### Mini-Player

A solid `chrome-lo` bar (no gradient, since it carries text) with a 1px `chrome-edge` top border and the panel shadow, stuck to the bottom of every page once something has played. It holds the 44px transport button, the track title (sans, links to the track page, hover `accent`) above an LCD-face time line in lime and cyan, and a compact waveform window. An error replaces the time line in `danger`.

### Status Meter

The project page's signature: the project's stage (Idea, Demo, Mixing, Done) as a row of segments in one LCD window, padded 4px with 4px between segments. Each segment is an uppercase LCD label, 6px by 12px (16px sides from `sm`), with 2px corners. Passed stages are lit `lcd-ink`, the current one is a solid `lcd-ink` fill with `lcd` text, and later ones are `lcd-unlit`; non-current segments turn `accent` on hover. It's a radio group: arrow keys move along it, each choice saves at once, and keyboard focus draws the 2px accent outline at 2px offset around the segment. A failed save puts the stage back and says so in a `danger` line.

### Status Badge

The stage at list size: a fixed 7.5rem LCD window padded 4px by 8px, with four pips (6px by 10px, 2px apart; lit `lcd-ink` up to the current stage, `lcd-cell` after) and the stage word in uppercase `lcd-ink`. The fixed width keeps badges aligned down the list. Screen readers hear "Status:" before the word.

### List Rows

Lists are rows on 1px `rule` lines (a rule above the first and under each), never cards. Project rows lift to a 60% `chrome-lo` fill on hover. Empty lists say what to do next on the same rules, in `muted`.

### Track Row

One row of a project's running order (see Layout for the grid): a drag grip (pointer only, `field-edge`, `accent` on hover and while dragging), the two-digit LCD number, the title link over a subtitle of the version and any non-ready state (in `danger` when failed), the LCD length, and ghost icon buttons for move up, move down, and remove. While dragged, the row lifts above its neighbours with a `chrome-lo` fill, 0.25rem corners, and a 2px `accent` outline, and follows the pointer; neighbours swap as it crosses their midpoints. The move buttons are the keyboard, touch, and screen-reader path, keep focus as the row moves, and a polite live region says where the track landed. A removed track leaves a same-height `chrome-lo` slot saying it's still in your tracks, with an Undo link that takes focus.

## Do's and Don'ts

### Do:

- **Do** build new styled surfaces from the tokens and utilities in `app/globals.css`, never one-off hex values.
- **Do** keep the LCD's unlit state visible: ghost "8"s behind digits, `lcd-cell` behind the waveform, `lcd-unlit` for stages ahead.
- **Do** use `accent` for focus on every themed control: a 2px outline at 2px offset plus the glow on buttons and links, at no offset with an accent edge on fields.
- **Do** keep everything still: no marquees, visualizers, or animated effects. A dragged row following the pointer is the only motion.
- **Do** put text on a solid backing (`canvas`, `chrome-lo`, or `lcd`), never on a gradient (CLAUDE.md section 9).
- **Do** keep working-screen controls flat graphite with a 1px `field-edge` edge, and save the LCD well for things that read out.
- **Do** separate list rows with 1px `rule` lines.
- **Do** keep privacy and destructive UI plain: literal wording, `danger` only for destructive actions, and a confirmation that says what stays and that it can't be undone.
- **Do** check CLAUDE.md section 9 for the direction of any surface not recorded here, and record it here once it ships.

### Don't:

- **Don't** set titles, labels, buttons, errors, or body text in Silkscreen.
- **Don't** use `lcd-cyan` or `lcd-ink` for buttons or links; interaction color is `accent`.
- **Don't** put a gradient, bevel, or shadow on working-screen controls, rows, or sections; those belong to player hardware and LCD windows.
- **Don't** wrap list items in cards; use rows on rules.
- **Don't** style the home page body, the sign-in and sign-up bodies, or the track page outside its player (including its Project selector) until the owner asks; they stay plain semantic HTML.
- **Don't** copy Winamp, LimeWire, Microsoft, or Apple names, logos, skins, or assets.
