# Sprint 7 — Lyrics Rendering

## Goal
The beamer displays synchronized lyrics during playback. The DJ window owns audio playback and sends beat/time ticks via IPC. The beamer is a pure renderer — it receives time events and highlights the active syllable.

---

## Architecture

### Audio source decision (DJ side)

```
if song.audioPath  → Plyr plays local MP3/audio file
else if song.youtubeId → Plyr plays YouTube (videoGap offset applied)
else → error: no playable source
```

### Timing master → beamer flow

```
DJ window (PlayerWidget / Plyr)
  requestAnimationFrame loop
    → read plyr.currentTime (seconds)
    → emit("ultrastar:time-tick", { currentTime: number })

Beamer window
  → listen("ultrastar:time-tick")
  → currentBeat = (currentTime - videoGap) * (bpm / 60) * 4
  → find active note at currentBeat
  → find current line (verse) at currentBeat
  → render lyrics with syllable highlight
```

### Beat formula

```ts
// UltraStar BPM is quarter-notes per minute, beat unit = 1/4 of a quarter note
currentBeat = (currentTime - videoGap) * (bpm / 60) * 4
```

`videoGap` defaults to `0` if not set (typical for YouTube-sourced songs).

---

## Playback start sequence (with Preview screen)

```
DJ loads song → status: 'loaded'
    ↓
Option A: DJ hits ▶ Play
    → emit play-song
    → beamer: idle → playing
    → DJ starts Plyr immediately
    → DJ starts time-tick loop

Option B: DJ hits "Show Preview"
    → emit preview-song (new event)
    → beamer: idle → preview (cover + title + player badges)
    → DJ waits — audio not yet started
    → DJ hits ▶ Play when room is ready
    → emit play-song
    → beamer: preview → playing
    → DJ starts Plyr
    → DJ starts time-tick loop
```

No countdown. DJ has full control of when audio starts.

---

## Beamer State Machine (updated)

```
idle ──preview-song──▶ preview ──play-song──▶ playing ──stop-song──▶ score ──stop-song──▶ idle
idle ──────────────────────────────play-song──▶ playing ──stop-song──▶ score ──stop-song──▶ idle
```

| IPC event | Beamer transition |
|---|---|
| `ultrastar:preview-song` | `idle → preview` |
| `ultrastar:play-song` | `idle/preview → playing` |
| `ultrastar:pause-song` | `playing → paused` |
| `ultrastar:resume-song` | `paused → playing` |
| `ultrastar:stop-song` (from playing/paused) | `→ score` |
| `ultrastar:stop-song` (from score) | `→ idle` |
| `ultrastar:time-tick` | updates `currentTime` while `playing/paused` |

---

## IPC Events

| Event | Payload | Direction |
|---|---|---|
| `ultrastar:preview-song` | `PreviewSongPayload` | DJ → Beamer |
| `ultrastar:time-tick` | `{ currentTime: number }` | DJ → Beamer |

`PreviewSongPayload`:
```ts
interface PreviewSongPayload {
  song: Song
  assetBase: string
  playerIds: number[]
}
```

---

## Lyric Rendering

### Display layout (beamer, playing state)

```
┌────────────────────────────────────────────────┐
│  [song header: title · artist]                 │
│                                                │
│                                                │
│   ♩  Hel - lo,   it's   me                    │  ← current line (large)
│      ████  ░░░░  ░░░░░  ░░                    │  ← note bars (optional)
│                                                │
│   I was wondering if after all                 │  ← next line (dimmed)
│                                                │
│              [P1] [P2]                         │  ← player badges
└────────────────────────────────────────────────┘
```

### Syllable highlight logic

```ts
// A note is "active" if currentBeat is within [note.start, note.start + note.length]
// The current verse = the verse whose notes contain the active beat
// Syllables before the active note in the current line → highlighted
// Active syllable → highlighted + slightly larger / colored
// Syllables after → dimmed
```

### Multi-track (2 players, 2 tracks)

If the song has a second track (`#P2` / `DUET`), each player renders their own line.
Split-screen or stacked layout (decide in implementation).
Sprint 7 focuses on single-track first; duet is a stretch goal.

---

## VideoGap handling

```ts
// song.videoGap is in seconds (parsed from #VIDEOGAP tag)
// default: 0
// currentBeat = (plyr.currentTime - song.videoGap) * (song.bpm / 60) * 4
// clamp to 0 to avoid negative beats during intro
```

---

## Preview Screen (Beamer)

Shown after `ultrastar:preview-song`, before `ultrastar:play-song`:
- Full-screen cover art (blurred background + centered cover)
- Song title (large) + artist
- Player badges (P1, P2…) with names
- Subtle "Get ready…" pulse animation
- No timer — DJ controls when to start

---

## Components to build / modify

| File | Change |
|---|---|
| `src/lib/ipc/tauri.ts` | Add `sendPreviewSong`, `sendTimeTick`, `onTimeTick` |
| `src/lib/ultrastar/types.ts` | Add `PreviewSongPayload` |
| `src/lib/stores/playback.svelte.ts` | Add `preview()` action; start rAF time-tick loop on `play()`; stop loop on `stop()`  |
| `src/components/ui/NowPlayingBar.svelte` | Add "Show Preview" button (when `status === 'loaded'`) |
| `src/routes/beamer/+page.svelte` | Handle `preview-song` event; add `preview` screen state |
| `src/components/game/BeamerView.svelte` | Add `preview` screen; add `playing` lyrics renderer |
| `src/components/game/LyricsRenderer.svelte` | New — syllable-level lyric display with beat-based highlight |

---

## Tasks

- [ ] Add `preview-song` IPC event + `PreviewSongPayload`
- [ ] Add `sendTimeTick` / `onTimeTick` IPC helpers
- [ ] `playback.svelte.ts`: add `preview()` action + rAF time-tick loop on play/pause/stop
- [ ] `NowPlayingBar`: add "Show Preview" button
- [ ] Beamer state machine: add `preview` state
- [ ] `BeamerView`: preview screen (cover + title + players)
- [ ] `LyricsRenderer`: current line + next line + syllable highlight
- [ ] VideoGap offset in beat calculation
- [ ] Stretch: duet / 2-track layout
