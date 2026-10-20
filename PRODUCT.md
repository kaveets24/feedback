# Product

<!-- impeccable:product-schema 1 -->

<!-- Product context for design tools (Impeccable). CLAUDE.md is the source of truth: if the two
     disagree, CLAUDE.md wins and this file gets fixed. -->

## Platform

web

A native mobile app (Expo) is planned for Phase 8. Until then, the web app has to work well on phones, because many listeners open share links there.

## Users

- **Primary: solo bedroom producers.** Individual songwriters and producers who make demos at home. They want honest feedback on rough bounces before a song is finished, without putting unfinished work in public.
- **Feedback givers, at launch: the artist's trusted circle.** Friends, mentors, collaborators, and engineers who open a private or unlisted share link (often on a phone, often signed out). They listen and leave comments at specific moments in the track.
- **Later: public listeners.** People who find public works in progress through profiles and discovery (Phase 6). This group is secondary to the link-holders.
- Bands and multi-person collaboration (stems, co-owners) are parked, not current audiences.

## Product Purpose

Feedback is a social app for sharing unfinished music. Artists upload rough song ideas, group them into projects, ship new versions as songs develop, decide exactly who can hear each one, and collect feedback pinned to moments on the waveform. Success is useful feedback that helps the artist make the next version better, not plays or followers.

## Positioning

SoundCloud meets Google Docs comments, for work-in-progress music. What sets it apart:

- **Versions are first-class.** Every comment belongs to a specific version, so the artist can see what changed and whether a note still applies.
- **Comments are timestamped on the waveform** and work like a to-do list (open or resolved), with an option for artist-only comments.
- **Private is the default everywhere.** Sharing works by unguessable links that can expire and be revoked, which is what makes people comfortable uploading unfinished work.

## Operating Context

- Core loop: upload a rough track (private) → group it into a project and upload new versions → share by link and say what feedback you want → listeners comment at timestamps → the artist resolves feedback and ships the next version.
- Uploads come from a home studio as quick bounces (mp3, wav, m4a, aac, flac, ogg; up to 200 MB and 20 minutes). Upload and capture have to be fast and low-friction.
- Listeners mostly arrive through a share link, sometimes signed out, often on a phone.
- Launch is invite-only: anyone can sign up, but accounts wait for manual approval, and pending users see a "you're on the list" screen.

## Capabilities and Constraints

- Domain terms (use them consistently): track, version, project, playlist, share link, feedback (comment), resolved/open, artist-only.
- Visibility levels: private, unlisted (link holders), public. Link roles: listen or comment. Downloads are off by default.
- Audio plays from short-lived signed URLs. Only one track plays at a time, through a single global mini-player that keeps playing across page changes.
- The waveform player is the centerpiece: it draws peaks, supports click-to-seek, and shows comment markers that jump to their comments.
- Out of scope: maps and location features, audio ML, reputation or leaderboards, payments (except planned $1 donations), direct messages, live streaming.
- Open product questions are tracked in CLAUDE.md section 13.

## Brand Commitments

- Name: **Feedback**.
- The visual direction is pinned in CLAUDE.md section 9 ("Visual style: Y2K / Winamp / LimeWire"), including its guardrails. **Styling is deferred** except the player (waveform player and mini-player), the app header, home, and the project pages: no CSS, Tailwind classes, or tokens elsewhere until the owner asks.
- Privacy, sharing, and destructive actions always use plain, serious language. No ironic copy there.
- Evoke the era without copying it: no Winamp, LimeWire, Microsoft, or Apple names, logos, skins, or assets.

## Evidence on Hand

None yet: no users, testimonials, press, metrics, or real tracks. Staging holds no real user data. Don't make up any of these.

## Product Principles

1. **Trust first.** People only upload unfinished work if privacy controls are obvious and reliable. Private is the default.
2. **Versions are first-class.** Feedback is always about a specific version, never just "the track".
3. **Feedback quality over vanity metrics.** Make it easy to leave and act on useful comments. Don't put play counts front and center.
4. **Rough is fine.** Uploading and capturing ideas should be fast and low-friction.

## Accessibility & Inclusion

- Meet WCAG AA contrast. Focus states are always clearly visible.
- Playback (play, pause, seek) works fully from the keyboard. Use semantic HTML and label every control.
- Respect `prefers-reduced-motion`: no scrolling text, sparkles, or animated visualizers when it's set.
- Pixel or bitmap fonts are for display only. Body text, comments, and forms use a readable sans-serif.
- Design for phones first. Nothing may require horizontal scrolling.
