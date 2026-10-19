---
name: Feedback
description: A Winamp-era hardware player for unfinished music. Only the player is styled so far.
colors:
  canvas: '#0b0e0c'
  ink: '#e4eae5'
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
  lcd-secondary:
    fontFamily: 'Silkscreen, ui-monospace, monospace'
    fontSize: '0.875rem'
    fontWeight: 400
  lcd-label:
    fontFamily: 'Silkscreen, ui-monospace, monospace'
    fontSize: '0.75rem'
    fontWeight: 400
  title:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 500
  body:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
rounded:
  sm: '0.25rem'
  md: '0.375rem'
  lg: '0.5rem'
spacing:
  tight: '8px'
  panel: '12px'
  gutter: '16px'
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
---

# Design System: Feedback

## Overview

**Creative North Star: "The Hardware Player"**

Feedback borrows the late-90s desktop music player: a graphite hardware housing, a recessed LCD window with lime phosphor ink, and chunky bevel buttons that sink when pressed. The waveform sits inside the LCD as segmented bars. The part you've already heard is lit, the rest shows as dim lime, and the empty cells stay faintly visible behind both, like the unlit segments on a real LCD.

**Scope so far: only the player surface exists.** That means the track page's waveform player and the global mini-player. Every other page is deliberately plain semantic HTML on the dark canvas until the owner asks for styling. The direction for everything not built yet (glossy LimeWire toolbars, results tables, striped progress bars, window panels, Aqua surfaces, light mode, skins) is in CLAUDE.md section 9, "Visual style: Y2K / Winamp / LimeWire". It is not recorded here because none of it exists in code. When one of those surfaces gets built, add it to this file from the shipped code.

The player is quiet and practical: dark only, no decorative motion, and one bright signature (the lit LCD) per screen. All tokens live in `app/globals.css` under `@theme`, and components use them, never one-off hex values.

**Key Characteristics:**

- Graphite chrome housing, raised by a 1px top highlight and a soft drop.
- Recessed deep green-black LCD windows set into the panel with a dark lip and a faint outer highlight.
- Lit, dim, and unlit segments: the LCD always shows its unlit cells.
- Lime for content inside the LCD, a slightly different lime for interaction, cyan for secondary readouts and the playhead.
- Bitmap face for LCD readouts only; clean system sans for everything else.
- No animation anywhere in the player.

## Colors

A green-tinted near-black world: graphite chrome, a deeper green-black LCD, lime phosphor, and a cyan second channel.

### Primary

- **Phosphor Lime** (`lcd-ink`): LCD content. The elapsed time, played waveform segments, and the time in the mini-player. 14.5:1 on the LCD.
- **Signal Lime** (`accent`): interaction only. The focus outline and glow, the hover color of buttons and links, the transport icon while playing or loading, and the text-selection background (with `canvas` text).

### Secondary

- **LCD Cyan** (`lcd-cyan`): the second LCD channel. The playhead (a 2px bar), "/ total" time, and the version plus state word (Stopped, Loading, Playing, Paused, Error). 12.5:1 on the LCD.

### Tertiary

- **Soft Coral** (`danger`): playback error lines under the player and in the mini-player, set in body sans, never in the LCD.

### Neutral

- **Green Black** (`canvas`): the page background.
- **Pale Mint Ink** (`ink`): body text and the transport icon at rest. 15.9:1 on the canvas.
- **Graphite High / Low** (`chrome-hi` / `chrome-lo`): the panel gradient, top to bottom. `chrome-lo` also forms the dark lip around each LCD window.
- **Chrome Edge** (`chrome-edge`): the 1px near-black outline on panels, LCD windows, and buttons.
- **Chrome Lip** (`chrome-lip`): the faint outer ring that makes an LCD window look set into the panel.
- **Button High / Low** (`button-hi` / `button-lo`): the transport button gradient, flipped when pressed.
- **LCD Black** (`lcd`): the LCD window background.
- **Dim Phosphor** (`lcd-dim`): waveform segments still to play.
- **Unlit Cell** (`lcd-cell`): every possible waveform segment, drawn behind the bars.
- **Ghost Segment** (`lcd-ghost`): the unlit "8" behind each LCD digit.

### Named Rules

**The Lit and Unlit Rule.** The LCD always shows its unlit state: played audio is `lcd-ink`, audio still to play is `lcd-dim`, empty cells are `lcd-cell`, and every digit sits over a ghost "8" in `lcd-ghost`. Never draw LCD content on a blank window.

**The Two Limes Rule.** `lcd-ink` is what the LCD displays; `accent` is what responds to you (focus, hover, active, selection). Don't swap them.

**The Cyan Channel Rule.** Cyan appears only in LCD contexts: the playhead and secondary readouts. It is never a button, link, or body color.

## Typography

**Display Font:** Silkscreen (with ui-monospace, monospace), self-hosted through next/font as `--font-silkscreen` and exposed as `font-lcd`.
**Body Font:** the system sans stack (Tailwind's default `ui-sans-serif, system-ui, sans-serif`).

**Character:** a bitmap LCD face for numbers and short readout labels, next to a plain system sans that keeps titles, errors, and page text easy to read.

### Hierarchy

- **LCD Display** (400, 1.5rem, 1.875rem from `sm`): elapsed time on the track page player, set in fixed-width cells (0.8em per digit, 0.45em per colon) so the readout doesn't shift as it ticks.
- **LCD Secondary** (400, 0.875rem, 1rem from `sm`): "/ total" in cyan.
- **LCD Label** (400, 0.75rem): the time line in the mini-player, and the version and state word on the track player (uppercase there).
- **Title** (500, 0.875rem): the track title link in the mini-player, truncated to one line.
- **Body** (400, 1rem): page text, which is still unstyled; error lines use 0.875rem (track player) or 0.75rem (mini-player).

### Named Rules

**The Bitmap for Readouts Rule.** Silkscreen is for LCD readouts only: times, version numbers, state words. Titles, errors, forms, comments, and body text use the sans.

## Layout

Styled content sits in a centered column, 48rem wide with 16px side gutters (the track page and the mini-player's inner row share it). The track page player is two rows: the transport button and LCD readout side by side with a 12px gap, then a full-width waveform 12px below, all inside 12px of panel padding. The waveform is 96px tall, 128px from the `sm` breakpoint (640px).

The mini-player is stuck to the bottom of the viewport across the full width, with its inner row padded 8px by 16px. On phones it wraps: the button and title/time on one line, and the waveform (28px tall) across the full width below. From `sm` up it's one row: button, a 288px title column, and the waveform (36px tall) filling the rest.

The waveform's geometry is fixed in CSS pixels so it stays crisp at any width: each bar takes a 6px slot (4px bar, 2px gap), each segment 4px of height (3px lit, 1px gap), bars mirror around a center gap, and quiet tracks are scaled up by at most 4x so near-silence still reads as near-silence.

## Elevation & Depth

Depth belongs only to the hardware. The page canvas is flat; the panel is raised, the LCD windows are recessed into it, and the transport button is raised until pressed, when it sinks.

### Shadow Vocabulary

- **Panel** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.1), 0 2px 8px rgb(0 0 0 / 0.5)`): the player housing and mini-player bar.
- **LCD well** (`box-shadow: inset 0 2px 5px rgb(0 0 0 / 0.75), 0 1px 0 rgb(255 255 255 / 0.07), 0 0 0 2px #1d211f, 0 0 0 3px #555d58`): every LCD window, readout or waveform.
- **Bevel** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.16), 0 1px 2px rgb(0 0 0 / 0.6)`): transport buttons at rest.
- **Bevel pressed** (`box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.65)`): transport buttons while pressed, with the gradient flipped.
- **Focus glow** (`box-shadow: 0 0 10px color-mix(in oklab, #a8f03f 55%, transparent)`): paired with the focus outline.

### Named Rules

**The Housed Hardware Rule.** Shadows describe hardware: raised housing, recessed windows, buttons that sink. Nothing else on the page gets a shadow.

## Shapes

Small, firm corners: 0.5rem on the track page's panel, 0.375rem on transport buttons, 0.25rem on LCD windows and the mini-player's title link focus area. The mini-player bar is square and drops its side and bottom borders, keeping only the top edge. Every hardware surface has a 1px `chrome-edge` outline.

## Components

### Transport Button

Chunky and tactile. A square bevel button with a graphite gradient (`button-hi` to `button-lo`), a 1px edge, and an inline SVG play or pause icon.

- **Sizes:** 56px with a 22px icon (track page), 44px with an 18px icon (mini-player).
- **Rest:** `ink` icon, bevel shadow.
- **Hover:** icon turns `accent`.
- **Pressed:** gradient flips and the bevel-pressed shadow makes it sink.
- **Playing or loading:** shows pause with an `accent` icon; loading sets `aria-busy`.
- **Focus:** 2px `accent` outline, 2px offset, plus the focus glow.

### LCD Readout

A recessed LCD window (`lcd` background, 1px edge, 0.25rem corners, LCD well shadow) padded 6px by 12px. It holds the elapsed time in phosphor lime over ghost "8"s, "/ total" in cyan, and the version and state word in small uppercase cyan, pushed to the right.

### Waveform Window

The signature component: the same LCD window, used as a keyboard-accessible slider. It draws segmented mirrored bars (see Layout), with lit, dim, and unlit segments and a 2px cyan playhead that appears once playback has moved past zero. Pointer down seeks, dragging previews and seeks on release, arrow keys step 5 seconds, Page Up/Down 30, Home/End jump to the ends, and Space plays or pauses. Focus uses the same accent outline and glow. It has no animation.

### Player Panel

The track page's housing: graphite gradient, 1px edge, panel shadow, 0.5rem corners, 12px padding, with the transport button, LCD readout, and waveform window inside. An error line in `danger` sits under the waveform on a solid `chrome-lo` strip, never on the gradient.

### Mini-Player

A solid `chrome-lo` bar (no gradient, since it carries text) with a 1px `chrome-edge` top border and the panel shadow, stuck to the bottom of every page once something has played. It holds the 44px transport button, the track title (sans, links to the track page, hover `accent`) above an LCD-face time line in lime and cyan, and a compact waveform window. An error replaces the time line in `danger`.

## Do's and Don'ts

### Do:

- **Do** build new styled surfaces from the tokens in `app/globals.css`, never one-off hex values.
- **Do** keep the LCD's unlit state visible: ghost "8"s behind digits, `lcd-cell` behind the waveform.
- **Do** use `accent` for focus (2px outline, 2px offset, plus the glow) on every themed control.
- **Do** keep the player still: no marquees, visualizers, or animated effects.
- **Do** put text on a solid backing (`chrome-lo`, `lcd`, or `canvas`), never on a gradient (CLAUDE.md section 9).
- **Do** check CLAUDE.md section 9 for the direction of any surface not recorded here, and record it here once it ships.

### Don't:

- **Don't** set titles, errors, or body text in Silkscreen.
- **Don't** use `lcd-cyan` or `lcd-ink` for buttons or links; interaction color is `accent`.
- **Don't** add shadows or chrome to anything that isn't player hardware. The rest of the app stays plain until the owner asks for styling.
- **Don't** copy Winamp, LimeWire, Microsoft, or Apple names, logos, skins, or assets.
