---
version: 1
slug: 'app-page-tsx'
primary_target: 'app/page.tsx'
related_targets: ['app/upload-form.tsx']
---

# Home: welcome, waiting list, and your tracks

Scope: `/` in all four states: signed out (welcome), pending ("you're on the list"), rejected, and signed in (upload a track, then your tracks). That includes the upload form (`app/upload-form.tsx`). Visitor mode: Operate for the signed-in state. The other three are short single-message screens in the same world, not marketing pages. Build path: code-led (narrow request inside the established world, no image generation).

Audience and job: a solo producer drops in a rough bounce and finds it again. Invitees first meet the pending screen, so it has to read calm and trustworthy. Signed-out visitors need one line on what this is and the way in.

## Direction contract

THESIS: Home is the inbox for rough ideas: an upload form you can use without thinking, over a plain list of your tracks. The one moment of hardware is the upload itself, a LimeWire-style striped bar filling an LCD window. It refuses the category default: a big drag-and-drop hero and a grid of track cards.

OWN-WORLD: The project pages' world, unchanged. Green-black canvas, system sans for all text, flat graphite fields and buttons with 1px field-edge, rows on 1px rules, figures (lengths, percent) in Silkscreen. The LCD well appears only while uploading, as the progress readout: diagonal lit lime stripes over unlit cells, with the percent in Silkscreen.

STORY: Signed in, the artist picks a file (the title fills itself), presses Upload, watches the striped bar fill, and lands on the track page. Below, every track sits newest first with its version, state and length. Signed out, a visitor reads one line and signs in. Pending and rejected users read a plain, kind status and can sign out.

FIRST VIEWPORT: Header, then a 48rem column: "Your tracks" as H1 (1.875rem, 600). An "Upload a track" section: a muted line on privacy and formats, an Audio file picker whose button matches btn, then Title and the primary Upload button on one row. While uploading, the striped LCD bar and percent appear under that row and the fields are disabled. "Tracks" H2, then rows of title link over "v2 · Processing" (danger when failed), with the LCD length at the right from sm and in the subtitle on phones. Older/Newest links at the foot.

FORM: Established-world extension of the projects list; the striped upload bar is the signature. seed: none (narrow request inside the established world; no concept roll ran)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

The upload bar: an LCD window whose lit portion is diagonal lime stripes that drift slowly while bytes move (the era's "busy" cue), with unlit cells showing behind the rest. The percent reads out beside it in Silkscreen. Under prefers-reduced-motion the stripes hold still. It's a real progressbar with a label and a value.

## Unresolved

- Rows don't name their project (the owner's call, 2026-10-19). Projects stay reachable from the Projects tab.
