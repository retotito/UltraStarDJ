# Sprint 6 — Playback Control

## Goal
The DJ can select a song from the queue or library, send it to the beamer windows, and control playback (play, pause, resume, stop) from a draggable Now Playing modal.

---

## Beamer State Machine

```
         play-song                    stop-song
idle ──────────────▶ countdown ──▶ playing ──────────────▶ score
  ▲                                                           │
  │                   play-song (new song)                    │ stop-song
  └───────────────────────────────────────────────────────────┘
```

The **beamer owns its state machine** — the DJ just sends IPC events. No extra events needed beyond what's already defined.

| DJ action | IPC sent | Beamer state change |
|---|---|---|
| ▶ Play (queue or library) | `play-song` | → `countdown` → auto `playing` |
| ⏸ Pause | `pause-song` | `playing` → `paused` |
| ▶ Resume | `resume-song` | `paused` → `playing` |
| ■ Stop (while playing/paused) | `stop-song` | → `score` |
| ■ Stop again (on score screen) | `stop-song` | → `idle` |
| ▶ Play new song (on score screen) | `play-song` | → `countdown` (score cleared) |

---

## Lock Rule

While `player.status === 'playing' | 'paused'`:
- ▶ buttons in queue rows and library are **disabled** (greyed out)
- Adding songs to the queue is still allowed — just can't start a new one
- Must stop current song first

---

## Now Playing Bar — Draggable Modal

- Floating card, default position: bottom-center of DJ window
- Drag handle on the top bar of the card
- Constrained to viewport bounds (clamp x/y on drag)
- Position stored in component state (not persisted)
- Does not block the canvas behind it
- Hidden when `player.status === 'idle'`

Contents: song title + artist | player badges (P1/P2…) | ⏸/▶ resume + ■ stop

---

## Score Screen (Beamer)

- Shown after first `stop-song` while playing/paused
- Displays player badges (P1/P2…) with placeholder scores
- No persistence — cleared when leaving the screen
- No player names — only P1/P2 badges
- Leave via: second `stop-song` → idle, or `play-song` → new countdown

---

## PlaySongPayload Change

Add `playerIds: number[]` to `PlaySongPayload` so the beamer gets singer info in the same event as the song (no separate `screen-config` dependency during playback).

```ts
interface PlaySongPayload {
  song: Song
  playerIds: number[]   // ← new
}
```

---

## IPC Events (all already defined)

| Event | Direction |
|---|---|
| `ultrastar:play-song` | DJ → Beamer |
| `ultrastar:stop-song` | DJ → Beamer |
| `ultrastar:pause-song` | DJ → Beamer |
| `ultrastar:resume-song` | DJ → Beamer |

---

## Components to Build

| Component | Description |
|---|---|
| `QueueView.svelte` | Queue rows: title, artist, ▶ (disabled while playing), remove |
| `NowPlayingBar.svelte` | Draggable floating modal: song info + player badges + pause/stop |
| `playback.svelte.ts` | Wraps player store, sends IPC on play/pause/stop, reads playerIds from displaysStore |

Existing files to update:

| File | Change |
|---|---|
| `src/lib/ultrastar/types.ts` | Add `playerIds` to `PlaySongPayload` |
| `src/lib/ipc/tauri.ts` | Update `PlaySongPayload` type |
| `src/components/game/BeamerView.svelte` | Render all 4 states: idle, countdown, playing, score |
| `src/routes/beamer/+page.svelte` | State machine driven by IPC events |
| `src/components/AppShell.svelte` | Mount `NowPlayingBar` outside scroll area |
| `src/components/Sidebar.svelte` | Add queue nav button |
| `src/components/views/LibraryView.svelte` | Song table with ▶ per row |

---

## Tasks

- [ ] Add `playerIds` to `PlaySongPayload` in `types.ts` + `tauri.ts`
- [ ] `playback.svelte.ts` — play/pause/resume/stop wired to IPC + displaysStore playerIds
- [ ] `QueueView.svelte` — queue list, active highlight, ▶ (locked while playing), remove
- [ ] `NowPlayingBar.svelte` — draggable modal, transport controls
- [ ] Wire `NowPlayingBar` into `AppShell.svelte`
- [ ] `LibraryView.svelte` — song table with search + ▶ per row (disabled while playing)
- [ ] Sidebar: add queue nav button
- [ ] Beamer `+page.svelte` — state machine (idle/countdown/playing/score)
- [ ] `BeamerView.svelte` — render countdown (3-2-1 animation), playing placeholder, score placeholder
