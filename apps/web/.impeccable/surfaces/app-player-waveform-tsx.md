---
version: 1
slug: 'app-player-waveform-tsx'
primary_target: 'app/_player/waveform.tsx'
related_targets: ['app/_player/track-player.tsx', 'app/_player/mini-player.tsx']
---

# Player: waveform player (track page) and mini-player

Scope: the track page's player and the global mini-player. Visitor mode: Operate. The rest of the web app stays plain until styling is asked for (CLAUDE.md section 9). The direction was pinned by CLAUDE.md section 9 ("the player is the hero"), so no concept roll was run. Build path: code-led (Operate surface, no image generation).

Audience and job: a solo producer (or someone they've shared a link with, from Phase 4 on) plays a rough version, scrubs to a moment, and keeps listening while moving around the app, often on a phone.

## Direction contract

THESIS: The waveform lives inside an LCD window. Played audio is lit segments; what's left to hear shows as the unlit "ghost" segments every LCD has. It replaces the category default: an orange or grey bar strip on a white page.

OWN-WORLD: Near-black ground tinted green. A graphite-chrome hardware panel with a 1px bevel highlight. A recessed LCD window, deep green-black, with lime phosphor ink and dim lime ghost segments. A cyan playhead and cyan secondary readouts. A bitmap face (Silkscreen) for the time readouts only. A chunky bevel transport button that sinks when pressed.

STORY: The listener sees where the song is loud and quiet, hits play, clicks or drags anywhere to jump, and keeps listening from the mini-player on other pages.

FIRST VIEWPORT: Under the track title sits the panel. Row one: a 56px bevel play button (lime icon while playing), then an LCD readout: large elapsed time in fixed digit cells over unlit "8" ghosts, then "/ total" in cyan, and on the right the version and a state word (Stopped, Loading, Playing, Paused, Error) in cyan. Row two: a full-width LCD waveform, 96px tall (128px from sm). The mini-player is a solid graphite bar stuck to the bottom of the viewport (sticky, so it never covers page content): button, title link plus LCD time, and a compact waveform strip.

FORM: Winamp-era hardware player rendered with standard web controls (button, slider). Position 1 of 1. seed: none (the direction is pinned by CLAUDE.md section 9; no concept roll ran)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

Scrubbing the LCD: pointer down anywhere on the waveform seeks there, dragging scrubs, and the lit segments follow the playhead. Arrow keys jump 5 seconds and Home/End go to the start or end. No decorative motion. Respects reduced motion.

## Unresolved

- Comment markers on the waveform arrive in Phase 5.
- Scrolling titles and the visualizer from section 9 are left out for restraint.
