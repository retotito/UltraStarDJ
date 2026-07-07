# Pitch Detection & Scoring — Architecture

## Overview

Pitch detection runs entirely on the **DJ window** (browser side).  
The beamer is a pure renderer — it only draws what the DJ tells it.

```
getUserMedia(deviceId)
  └─ AudioContext
       └─ MediaStreamSourceNode
            └─ AnalyserNode  ──────────────────────────────────────────
                  │                                                    │
                  │ getFloatTimeDomainData()                           │
                  ▼                                                    │
           pitchy (YIN algorithm)                                      │
                  │                                                    │
                  ▼                                                    │
           frequencyToMidi()          Ring buffer (per player)        │
                  │                  ← smoothing window               │
                  ▼                                                    │
           octave-normalize vs target note                            │
                  │                                                    │
          ┌───────┴────────┐                                           │
          │                │                                           │
    within tolerance?     outside tolerance?                          │
          │                │                                           │
    midiNote = target    midiNote = detected                          │
          │                │                                           │
          └───────┬────────┘                                           │
                  ▼                                                    │
         PitchTick IPC ──────────────────────────────► Beamer         │
         { playerId, midiNote, beat, correct }         draws sung note │
```

---

## Per-Player Ring Buffer

Each active player gets their own ring buffer (`Float32Array`, circular):

```ts
class PitchRingBuffer {
  size = 5          // last 5 pitch samples (~83ms at 60fps)
  buf: number[]     // ring of MIDI note values
  ptr = 0

  push(midiNote: number) { this.buf[this.ptr++ % this.size] = midiNote }
  median(): number { /* sorted median of buf */ }
}
```

**Why per-player?**  
- Each player has their own mic (device + channel)
- Buffers must be independent — P1's ring must not influence P2's result
- On song start/resume: buffers are cleared

**Smoothing strategy:** median of last N samples (not mean — median rejects one-off spikes/dropouts).

---

## Pitch Detection Library

**`pitchy`** (npm: `pitchy`) — pure TypeScript YIN implementation, no WASM.

- Input: `Float32Array` from `AnalyserNode.getFloatTimeDomainData()`
- Output: `[frequency, clarity]` — clarity 0–1 (reject if < 0.9)
- Buffer size: 2048 samples @ 44100Hz ≈ 46ms window

Alternative: `aubio.js` (WASM, higher accuracy, heavier). Start with `pitchy`, upgrade if needed.

---

## Octave-Invariant Matching

UltraStar notes use semitone numbers (0 = C4). Singers often sing in a different octave than the notation. Matching is octave-invariant:

```ts
function matchesTarget(detected: number, target: number, tolerance: number): boolean {
  const diff = Math.abs(detected - target) % 12
  const distance = diff > 6 ? 12 - diff : diff
  return distance <= tolerance
}
```

Tolerances (configurable via difficulty setting):
| Difficulty | Tolerance |
|---|---|
| Easy   | ±3 semitones |
| Medium | ±2 semitones |
| Hard   | ±1 semitone  |

---

## IPC Events

### `ultrastar:pitch-tick`
Sent from DJ → all beamers every animation frame during playback.

```ts
interface PitchTickPayload {
  ticks: Array<{
    playerId: number
    midiNote: number    // -1 = no pitch detected
    correct: boolean    // within tolerance of current note
    beat: number        // current beat
  }>
}
```

Batched per frame (all players in one event) to minimize IPC calls.

### `ultrastar:score-update` *(future)*
Sent when points accumulate (on phrase end or beat boundary).

```ts
interface ScoreUpdatePayload {
  scores: Array<{
    playerId: number
    points: number
    correctBeats: number
    totalBeats: number
  }>
}
```

---

## Beamer: Pitch Rendering in NoteLane

The beamer receives `pitch-tick` events and stores the latest midiNote per player.

**Drawing rule:**
- Only draw within a note's beat range (never between notes)
- If `correct`: draw a thin bar **at the note's row** (same row as the note bar), player color, full opacity
- If wrong: draw at the **detected pitch row**, dimmer color (50% opacity)
- Bar draws left-to-right as beat progresses through the note

```
Note bar (white/black):  [============================]
Sung bar (correct):      [████████████                ]  ← grows with beat
Sung bar (wrong):        (drawn at wrong pitch row, dimmer)
```

---

## Scoring *(next sprint)*

Score accumulates on the **DJ side** from pitch tick results.

| Note type | Points per correct beat |
|---|---|
| Normal  | 100 |
| Golden  | 200 |
| Freestyle / Rap | 0 (always "correct") |

**Phrase bonus**: if all beats in a phrase are correct → +1000 bonus.

### Score Screen (multi-beamer)

When a song ends, `ultrastar:stop-song` triggers the score screen.  
**All players appear on all beamers**, sorted by player ID (not by which players are assigned to that beamer):

```
┌─────────────────────────────────┐
│  🎤 Player 1   ████████░░  8540 │
│  🎤 Player 2   ███████░░░  7230 │
│  🎤 Player 3   █████████░  9100 │
└─────────────────────────────────┘
```

Score payload is sent with `ultrastar:stop-song` (or a separate `ultrastar:show-score` event).

---

## Implementation Order

1. ✅ **Difficulty setting** — done
2. **`pitchy` integration** — `PitchDetector` class per player, `getUserMedia` per mic device
3. **Per-player ring buffer** — `PitchRingBuffer` (median smoothing)
4. **`PITCH_TICK` IPC** — emit every rAF frame during playback
5. **Beamer: sung note bars** — new `SungNote` overlay in `NoteLane`
6. **Score accumulation** — DJ side, phrase bonus
7. **Score screen** — all players on all beamers
