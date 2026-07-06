# Player Modal — Concept & Feature Spec

The **Now Playing card** (`NowPlayingBar.svelte`) is a floating, draggable overlay on the DJ window. It is the primary control surface during a live karaoke session.

---

## Current Layout (top → bottom)

| Section | Content |
|---|---|
| **Drag handle** | Drag to reposition; `×` button hides the card |
| **Status bar** | Contextual state: No song / No display / Playing (+ time) / Paused / Ready |
| **Song info** | Title + artist; player badges (P1–P4) for assigned players |
| **Song volume** | `HorizontalFader` — controls `gameChannel.gain` + level meter. Dimmed for YouTube songs. |
| **Transport controls** | Home screen · Preview · Play/Pause · Stop · (countdown) |

---

## Transport Controls (left → right)

| Button | Icon | Action | Disabled when |
|---|---|---|---|
| **Home screen** | `tv_off` | `playback.clearBeamers()` | No display / is active / already on home |
| **Preview** | `tv` | `playback.preview()` — shows song title screen on beamer | Not loaded / is active / no display / already previewing |
| **Play** | `play_arrow` | `playback.play()` | Not loaded / no display / already playing |
| **Pause** | `pause` | `playback.pause()` | Counting down |
| **Stop** | `stop` | `playback.stop()` | Not active |

---

## Planned: Mic Output Section

To be added **between Song volume and Transport controls**.

### Purpose
Control the **output mix level** of each active player's mic during a live song. This is separate from the mic gain slider in the Audio Input popup (which sets input sensitivity). This section controls how loud each mic is in the final mix.

### Behaviour
- Only shown when at least one player has a mic assigned
- One row per player that has a mic assigned
- Auto-start mic monitoring when a song starts playing (`playback.status === 'playing'`)
- Auto-stop mic monitoring when a song stops (`playback.stop()`)

### Per-player row layout

```
[P1 color dot] [Player name]   [Mute toggle 🔇]
[Level meter (MicLevelMeter)]
[Volume fader  ────●──────── ]  (0–200%)
```

| Element | Description |
|---|---|
| Color dot | Player accent color |
| Player name | Read-only label (e.g. "Alice") |
| Mute toggle | Silences this player's mic in the mix without stopping monitoring |
| Level meter | `MicLevelMeter` — live RMS from `playersStore.levels[player.id]` |
| Volume fader | Controls `playersStore.gain[player.id]` (0–2.0, default 1.0) |

### Store changes needed
- `playersStore` already has `gain` per player — reuse this
- Add `mutedIds: Set<number>` to `playersStore` — when muted, gain sent to Rust = 0, fader UI stays at its position
- Auto-monitoring: `playback` store needs to call `startMicMonitor` / `stopMicMonitor` for all assigned players on play/stop

### Component plan
- New component: `MicMixRow.svelte` — one row per player
- Used inside `NowPlayingBar.svelte` in a `{#if activeMicPlayers.length > 0}` block
- `activeMicPlayers = $derived(playersStore.all.filter(p => p.mic))`
