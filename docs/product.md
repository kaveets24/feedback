# Product

> What Feedback is for, its core loop and principles, and what is out of scope. Linked from [CLAUDE.md](../CLAUDE.md); keep it current when a decision changes.

**Pitch:** SoundCloud meets Google Docs comments, for work-in-progress music.

**Core user loop**

1. Artist uploads a rough track (private by default).
2. Artist groups tracks into a **project** (album/EP/idea folder) and uploads new **versions** as the song evolves.
3. Artist shares privately (secret link) or publicly, and says what feedback they want.
4. Listeners leave **timestamped comments** on the waveform.
5. Artist works through feedback (resolve/unresolved), then ships the next version.

**Product principles**

- **Trust first.** People only upload unfinished work if privacy controls are obvious and reliable. Private is the default everywhere.
- **Versions are first-class.** Feedback attaches to a specific version, never just "the track."
- **Feedback quality over vanity metrics.** Optimize for useful comments, not play counts.
- **Rough is fine.** Upload and capture flows must be fast and low-friction.

**Explicitly out of scope for now** (do not build or scaffold these)

- Geolocation, maps, places, PostGIS, location-based discovery or ranking. The one exception is a profile's optional city, a label the user picks from a fixed list that nothing filters, sorts, or ranks by (see `profiles` in [domain-model.md](domain-model.md))
- Audio feature extraction / ML / embeddings. The exceptions are a track's tempo (BPM, Phase 10) and, much later, its key and genre (Phase 13), each editable by the artist; anything else, such as embeddings or similarity, stays out (decided 2026-11-04)
- Reputation scores, leaderboards, give-to-get credits
- Payments and monetization (the app starts free; $1 artist donations are parked, see the parking lot in [plan.md](plan.md)), plus direct messaging between users (Phase 14's help chat is only ever with the team) and live streaming
- Mobile apps (planned for Phase 12; keep the API client-agnostic so it's easy later) and desktop apps (a folder-sync app is an idea in the parking lot in [plan.md](plan.md))
