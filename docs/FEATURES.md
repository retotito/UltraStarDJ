# Features Backlog

Sprint definitions live in `docs/sprints/`. One file per sprint.
Current sprint: `docs/sprints/sprint-1-library.md`

## Sprint 0 — Scaffold ✅
- [x] Tauri 2 + Svelte 5 + TypeScript project
- [x] Two-window architecture (main + beamer)
- [x] Design tokens & global CSS (`src/app.css`)
- [x] Svelte 5 rune stores (dialog, player, queue, settings)
- [x] IPC layer (`src/lib/ipc/tauri.ts`)
- [x] UltraStar types (`Song`, `Note`, `NoteTrack`)
- [x] Copilot instructions & architecture docs

## Sprint 1 — Song Library
- [ ] Rust command: open folder picker dialog
- [ ] Rust command: scan folder recursively for `.txt` files
- [ ] TypeScript: parse UltraStar `.txt` header (title, artist, bpm, gap, cover, audio, video)
- [ ] IndexedDB: store and query song library
- [ ] Settings dialog: add/remove/toggle song sources
- [ ] LibraryView: song table (title, artist, year, language, BPM)
- [ ] LibraryView: search by title/artist
- [ ] LibraryView: filter by language / genre
- [ ] LibraryView: column sort
- [ ] LibraryView: cover art thumbnail

## Sprint 2 — DJ Playback
- [ ] Add song to queue from library
- [ ] QueueView: ordered list with move-up/down and remove
- [ ] Preview song (audio only, DJ headphones)
- [ ] Send song to beamer window (IPC)
- [ ] Beamer: play audio + video background
- [ ] Beamer: idle screen when no song active
- [ ] Player controls in DJ window (pause/stop/seek)
- [ ] Volume control

## Sprint 3 — Lyrics & Sync
- [ ] Full UltraStar `.txt` note parser (notes, beats, syllables)
- [ ] Beat → millisecond timing calculation
- [ ] BeamerView: lyrics display synchronized to audio
- [ ] BeamerView: note bars (canvas rendering)
- [ ] Lyrics offset adjustment setting

## Sprint 4 — Multiplayer & Scoring
- [ ] 2-player note tracks
- [ ] Microphone input (Web Audio API)
- [ ] Pitch detection (autocorrelation / YIN)
- [ ] Score calculation
- [ ] Score display on beamer

## Sprint 5 — Polish & Extra Sources
- [ ] USDB song source (requires Tauri Rust HTTP client, bypasses CORS)
- [ ] Dark/light theme toggle
- [ ] Keyboard shortcuts
- [ ] Song detail modal
- [ ] Export/import queue as playlist
- [ ] YouTube background (iframe fallback when no video file)
