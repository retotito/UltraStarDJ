# Mic Configuration — Concept & Architecture

## Signal chain per player

```
[Physical Mic]
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  PLAYER MIC CONFIGURATION  (PlayerCard — Audio Input)   │
│                                                         │
│  1. Input Gain   (0–2×, default 1.0)                    │
│     Boosts or cuts the raw signal before anything else. │
│     Useful for: quiet mics, cheap interfaces.           │
│                                                         │
│  2. Threshold / Noise Gate  (0–0.5, default 0.1)        │
│     Blocks signal below this amplitude fraction.        │
│     Kills breath noise, room rumble, background music.  │
│                                                         │
│  3. Global Mic Delay  (0–300 ms, default 0 ms)          │
│     Shifts the beat comparison window backwards.        │
│     Set once for all players — covers USB interface      │
│     buffer latency. Top of the Audio Input modal.       │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  PITCH ENGINE                                           │
│  getUserMedia → GainNode(inputGain) → AnalyserNode      │
│  → pitchy → PitchRingBuffer(5) → match note at          │
│    (currentBeat - msToBeats(bpm, globalMicDelay))       │
│  → PitchTick IPC → Beamer renders sung-note indicator   │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  LIVE DJ MIXER  (Player modal / NowPlayingBar)          │
│                                                         │
│  4. Mix Fader  (0–1, default 0.8)                       │
│     Controls how loud this player's mic is in the       │
│     speaker output during the live session.             │
│     Mute toggle per player.                             │
└─────────────────────────────────────────────────────────┘
```

---

## Per-player fields (PlayerConfig)

| Field | Range | Default | Applied in |
|---|---|---|---|
| `inputGain` | 0.0–2.0 | 1.0 | JS: `GainNode`; Rust: multiply sample |
| `threshold` | 0.0–0.5 | 0.1 | JS: noise gate in `PitchDetector.sample()`; Rust: noise gate in `build_input_stream` |
| `mixGain` | 0.0–1.0 | 0.8 | Rust: output channel volume (already exists) |

## Global fields (AppSettings)

| Field | Range | Default | Applied in |
|---|---|---|---|
| `micDelay` | 0–300 ms | 0 | JS only: `pitchSession.tick()` beat offset |

---

## 1. Input Gain

### Why it's needed
Some USB microphones output a very low signal even at max hardware gain. Without software boost,
the threshold gate eats too much of the signal and pitch detection suffers.

### JS implementation
In `PitchDetector`, insert a `GainNode` between `getUserMedia` and the `AnalyserNode`:

```ts
const source  = ctx.createMediaStreamSource(stream)
const gainNode = ctx.createGain()
gainNode.gain.value = this.inputGain  // 0–2
source.connect(gainNode)
gainNode.connect(this.analyser)
```

To update live (while monitoring):
```ts
gainNode.gain.setTargetAtTime(newGain, ctx.currentTime, 0.01)
```

### Rust implementation
In `build_input_stream_*`, multiply each sample by `input_gain` before the threshold check:

```rust
let gained: f32 = sample * input_gain;
let above = gained.abs() > threshold;
if above { route_to_output(gained) } else { silence }
```

### UI
In `PlayerCard`, a `HorizontalFader` row labeled **"Gain"**:
- `level`: current mic level (after gain, so the meter shows what pitch engine sees)
- `gain`: `player.inputGain` (0–2, maxGain=2)
- No dimming overlay (it's a gain boost, not a gate)

---

## 2. Threshold / Noise Gate

### Why it's needed
Without a gate, breath noise and background music confuse the pitch engine, producing
spurious low-confidence pitch detections.

### Applied after inputGain
The threshold value is compared against the **post-gain** signal amplitude. This means:
- inputGain=2, threshold=0.1 → gate opens when raw signal > 0.05 full-scale
- This is correct: you boosted the signal, so the gate should be more sensitive

### JS implementation (already done)
In `PitchDetector.sample()`, check peak amplitude of the AnalyserNode buffer. If below
threshold → return `midiNote = -1`.

### Rust implementation (already done)
In `build_input_stream_*`, check peak of sample chunk. If below threshold → emit rms=0,
do not route to output.

### UI
In `PlayerCard`, a `HorizontalFader` row labeled **"Gate"**:
- `level`: current mic level
- `gain` + `threshold`: `player.threshold` (maxGain=0.5)
- Right-of-knob dark overlay shows gated zone

---

## 3. Global Mic Delay

### How it works
The mic captures audio that the singer produced `micDelay` ms ago. Rather than buffering
audio (complex, latency-additive), we shift the **beat comparison index** backward:

```ts
// UltraStar BPM is "quarter-BPM" → multiply by 4 for real beats per second
function msToBeats(bpm: number, ms: number): number {
  return (ms / 1000) * (bpm / 60) * 4
}

// In pitchSession.tick():
const delayedBeat = currentBeat - msToBeats(song.bpm, settings.micDelay)
const targetNote  = findNoteAtBeat(track, delayedBeat)
```

**No audio buffering. No DelayNode. Pure index arithmetic.**

### Why global, not per-player
In most setups all mics share a single USB audio interface → identical latency.
Per-mic delay (Phase 2) is an advanced override for mixed Bluetooth+wired setups.

### UI placement
**Top of PlayersView modal**, above the player cards. A single row:

```
[clock icon]  Mic Delay   [────●────]  0 ms
```

- Slider: 0–300 ms, step 10 ms
- Default: 0 ms
- Label shows current value in ms

---

## 4. Mix Fader (already implemented)

Lives in `MicMixRow` inside the `NowPlayingBar` (player modal).
Controls Rust output volume for this player's mic channel.
Range: 0–1. Mute toggle sends volume=0 to Rust without moving fader.

---

## Component plan

### PlayerCard — two fader rows when mic assigned:

```
[mic icon]  [device selector]
[Test mic / Stop test]

Gain  [════════●════════════]  100%   ← inputGain, 0–200%
Gate  [════●░░░░░░░░░░░░░░░░]  10%    ← threshold, right side dimmed
```

### PlayersView — header row above cards:

```
Audio Input                    [refresh] [×]
─────────────────────────────────────────────
🕐 Mic Delay  [────────────●────────]  0 ms
─────────────────────────────────────────────
[P1 card]  [P2 card]  [P3 card]  [P4 card]
```

---

## Implementation order

1. `players.svelte.ts` — add `inputGain: number` (default 1.0) to `PlayerConfig`
2. `settings.svelte.ts` — add `micDelay: number` (default 0) to `AppSettings`
3. `PitchDetector.ts` — insert `GainNode` for `inputGain`
4. `pitchSession.svelte.ts` — accept `micDelay`, pass `delayedBeat` to note matching
5. `playback.svelte.ts` — pass `micDelay` from settings to `pitchSession.tick()`
6. `audio.rs` — accept `input_gain`, multiply before threshold check
7. `tauri.ts` — add `input_gain` to `startMicMonitor` IPC
8. `PlayerCard.svelte` — add Gain fader row, relabel Gate row
9. `PlayersView.svelte` — add global Mic Delay slider at top
