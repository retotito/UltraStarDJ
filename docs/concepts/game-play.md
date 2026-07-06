# Game Play — Beamer Rendering & Pitch Scoring

## Overview

This document covers everything needed to implement live karaoke game play on the beamer window:
pitch detection from microphones, matching sung pitches to notes, scoring, and the Canvas-based
note lane rendering. The design is heavily inspired by [allkaraoke.party](https://github.com/Asvarox/allkaraoke).

---

## Terminology (aligned with allkaraoke)

| Term | Meaning |
|---|---|
| `beat` | UltraStar beat unit — derived from `bpm` and `gap` |
| `beatLength` | Duration of one beat in ms = `60000 / (bpm / 4)` |
| `pitch` | Semitone number (MIDI-style), `0` = C0 |
| `frequency` | Raw Hz value from mic |
| `distance` | Semitones between sung pitch and target note pitch, **octave-independent** (mod 12) |
| `frequencyRecord` | `{ timestamp: ms, frequency: Hz }` — one mic sample |
| `playerNote` | Group of consecutive frequencyRecords matching a note at the same distance |
| `section` | A lyric line (NotesSection) or instrumental break (PauseSection) |
| `tolerance` | Allowed distance offset that still counts as a hit (default: 2 semitones) |

---

## Architecture

```
Microphone (getUserMedia)
  → Web Audio AnalyserNode (fftSize 2048)
  → AubioJS Pitch Detector (YIN algorithm)         ← runs on setInterval ~23ms
  → frequencyRecord { timestamp, frequency }
  → PitchEngine (per player)
      → appendFrequencyToPlayerNotes()              ← groups records into playerNotes
      → calculateScore()                            ← live score from playerNotes
  → CanvasDrawing (rAF loop)
      → drawNotesToSing()   ← target note lane (grey/gold bars)
      → drawSungNotes()     ← player's sung notes (colored bars)
      → drawFlare/particles ← visual effects on hit
```

---

## 1. Pitch Detection

**Library:** [aubiojs](https://github.com/qiuxiang/aubiojs) — WebAssembly port of the Aubio pitch detection library. Uses the YIN algorithm.

```ts
import aubiojs from 'aubiojs'

const { Pitch } = await aubiojs()
const detector = new Pitch('default', 2048, 256, audioContext.sampleRate)
detector.setTolerance(0.5)

// In setInterval (every ~23ms at 44100Hz / 2048 buffer):
const buffer = new Float32Array(2048)
analyser.getFloatTimeDomainData(buffer)
const frequencyHz = detector.do(buffer)  // returns 0 if no pitch detected
```

**Key facts:**
- Returns `0` if no singing detected — skip these records
- Input lag: allkaraoke hardcodes `180ms` — subtract from timestamp when matching beats
- Two-channel support (stereo mic = two players on one mic) via `ChannelSplitterNode`

**Frequency → pitch (semitone):**

```ts
function freqToMidi(hz: number): number {
  return Math.round(12 * Math.log2(hz / 440) + 69)
}
```

**Distance calculation (octave-independent):**

```ts
function calcDistance(frequency: number, targetPitch: number): { distance: number, preciseDistance: number } {
  if (frequency === 0) return { distance: Infinity, preciseDistance: Infinity }
  const sung = 12 * Math.log2(frequency / 440) + 69
  const diff = sung - targetPitch
  // Fold into [-6, +6] range (octave-independent)
  const mod = ((diff % 12) + 18) % 12 - 6
  return {
    distance: Math.round(mod),
    preciseDistance: mod,
  }
}
```

---

## 2. Player Notes — Grouping Frequency Records

`appendFrequencyToPlayerNotes()` groups consecutive `frequencyRecord`s into `PlayerNote` objects:

- A new `PlayerNote` is started when:
  - The target note changes (new syllable)
  - The distance changes (pitch jumped to a different semitone offset)
  - There's a singing gap > 100ms (break tolerance)
- `PlayerNote.length` is extended each tick while the same distance holds
- `isPerfect = distance === 0 && |length - note.length| < 0.5 beats`
- `vibrato = distance === 0 && detectVibrato(frequencyRecords)` — detects oscillation in pitch changes

**Vibrato detection:** scans direction-change points in the frequency stream; if the intervals between changes are consistent (within 1.75× factor) for a window of 6 changes → vibrato.

---

## 3. Scoring

Max score per song: **3,500,000** (allkaraoke's value — use the same for UltraStar compatibility).

**Note type multipliers:**

| Type | Multiplier |
|---|---|
| `normal` | 1× |
| `golden` (star) | 2× |
| `freestyle` / `rap` | 0.25× (always hit if any singing) |
| `rap-golden` (rapstar) | 0.5× |
| perfect bonus | +0.5× per beat on perfect notes |
| vibrato bonus | +0.25× per beat with vibrato |

**Algorithm:**
1. Count total singable beats in song (weighted by multipliers) → `maxBeats`
2. `pointsPerBeat = MAX_POINTS / maxBeats`
3. For each `PlayerNote` with `distance === 0`: accumulate `note.length` into the corresponding note type bucket
4. `score = sum(buckets) * pointsPerBeat`

Score is computed live during playback (recalculated each frame from `playerNotes`).

---

## 4. Canvas Note Lane Rendering

Each player gets a horizontal strip of the canvas. For 1 player: full height. For 2 players: split top/bottom.

**Layout per player strip:**
```
[horizontal padding 15%] [note lane area] [horizontal padding 15%]
```

**What's drawn each frame:**

### 4a. Target notes (notes to sing)
- Grey rounded rectangles at the correct pitch row
- Gold/yellow for `golden` type
- Wider height for golden (`BIG_NOTE_HEIGHT = NOTE_HEIGHT + 6`)
- X position based on beat position within current section
- Slide-in animation from right on section start (bezier easing, 25th power)
- Progressive slide: notes drift slightly left as section progresses

### 4b. Player sung notes
- Colored bars (per-player color) at the actual sung pitch row
- Full opacity when `distance === 0` (hit), semi-transparent when off-pitch
- Thicker/bigger when on-target
- Frequency trace drawn when hitting perfectly (shows precise pitch within the note height)

### 4c. Particles & effects (optional high-quality mode)
- **Flare**: ray + triangle particle at leading edge of a hit note
- **Gold particle**: sparkles on golden note hits
- **Vibrato particle**: extra effect when vibrato detected
- **Exploding note**: burst on section end for hit notes
- **Fadeout note**: fading ghost of notes on section change

### 4d. Section-based display
- Only the **current section** is shown at any time (one lyric line worth of notes)
- On section change: fadeout/explode old notes, new section slides in from right
- Pitch range auto-scaled to `[minPitch - 6, maxPitch + 6]` of the current song track

---

## 5. Oscilloscope (optional)

Allkaraoke doesn't show a mic oscilloscope during gameplay — it shows a mic level meter in the setup screen. For UltrastarDJ we can optionally add an oscilloscope overlay per player using the raw `FloatTimeDomainData` from the AnalyserNode. This is a nice-to-have, not required for MVP.

---

## 6. Word Splitting (Lyrics Highlighting)

Currently `LyricsRenderer.svelte` doesn't highlight the **current syllable** within a line. To fix:

- Track `currentBeat` from the audio time
- Find the note whose `startBeat <= currentBeat < startBeat + lengthBeats`
- Highlight that syllable — change color/weight/underline

This is separate from note lane rendering — it happens in the existing `LyricsRenderer`.

---

## 7. Implementation Plan

### Phase 1 — Pitch detection & player notes (no UI)
- [ ] Install `aubiojs`: `npm install aubiojs`
- [ ] `src/lib/game/pitch-detector.ts` — AubioJS wrapper, `getFrequency(buffer) → Hz`
- [ ] `src/lib/game/mic-input.svelte.ts` — `getUserMedia`, `AnalyserNode`, setInterval loop → reactive `frequencies[]` and `volumes[]`
- [ ] `src/lib/game/calc-distance.ts` — `calcDistance(hz, targetPitch) → { distance, preciseDistance }`
- [ ] `src/lib/game/append-frequency-to-player-notes.ts` — grouping logic
- [ ] `src/lib/game/detect-vibrato.ts` — vibrato detection
- [ ] `src/lib/game/player-state.svelte.ts` — per-player state: `playerNotes`, `score`, `currentSection`

### Phase 2 — Note lane Canvas rendering
- [ ] `src/lib/game/calculate-layout.ts` — canvas pixel coords for a note given pitch/beat
- [ ] `src/components/game/NoteLane.svelte` — `<canvas>` component, rAF loop
  - `drawTargetNotes()` — grey/gold bars
  - `drawSungNotes()` — colored player bars
  - `drawFrequencyTrace()` — precise pitch line within hit note
- [ ] Wire into `BeamerView.svelte`: one `NoteLane` per player, stacked below lyrics

### Phase 3 — Scoring display
- [ ] Live score shown per player in BeamerView (large text, top corner)
- [ ] Score bar / progress indicator

### Phase 4 — Lyrics word splitting
- [ ] Update `LyricsRenderer.svelte` to highlight current syllable based on `currentBeat`

### Phase 5 — Effects (nice-to-have)
- [ ] Particle system (port from allkaraoke or implement simpler version)
- [ ] Oscilloscope overlay

---

## 8. Files to Create

```
src/
  lib/
    game/
      pitch-detector.ts          ← AubioJS wrapper
      mic-input.svelte.ts        ← reactive mic stream + frequency polling
      calc-distance.ts           ← Hz → distance to target pitch
      append-frequency-to-player-notes.ts
      detect-vibrato.ts
      calculate-score.ts         ← live score from playerNotes
      player-state.svelte.ts     ← per-player reactive state
      game-engine.svelte.ts      ← top-level: ties mic + state + timing together
  components/
    game/
      NoteLane.svelte            ← Canvas note lane per player
      ScoreDisplay.svelte        ← live score per player
```

---

## 9. Multi-Window Architecture — Where Calculation Happens

### Rule: DJ window = game engine, Beamers = dumb displays

Microphones are physically connected to the DJ's machine. `getUserMedia()` runs in the DJ window's
WebView. Beamer windows are separate Tauri WebView processes on the same machine — routing mic
access into them would be messy and redundant.

```
DJ Window
  ├── getUserMedia() → mic streams (one per assigned player)
  ├── AubioJS pitch detection (runs in DJ window, ~23ms interval)
  ├── PlayerState per player (playerNotes, score, currentSection)
  └── Tauri IPC → emits game state to beamer window(s)

Beamer Window(s)
  ├── Receive IPC events from DJ
  ├── Reconstruct playerNotes locally from incoming frequencyRecord deltas
  ├── Render note lane canvas (for assigned player IDs only)
  ├── Render lyrics with current beat highlight
  └── Render score display
```

### IPC strategy — delta push (Option B)

Rather than sending the full accumulated `playerNotes` array every frame (which grows unboundedly),
the DJ sends only new `frequencyRecord`s since the last tick. The beamer runs its own local copy
of `appendFrequencyToPlayerNotes()` to reconstruct the note state.

- On `ultrastar:play-song`: beamer receives full `Song` + assigned `playerIds`
- Each game tick: DJ emits new frequency records only
- Beamer accumulates locally → renders canvas

### Players per beamer

`PlaySongPayload.playerIds` already carries which players are on which beamer.

| Player count on beamer | Canvas layout |
|---|---|
| 1 | Full height — one note lane |
| 2 | Split top/bottom — two note lanes |
| 3–4 | Split into quarters (two per beamer max recommended) |

### Updated IPC event contract

| Event | Payload | Direction | Notes |
|---|---|---|---|
| `ultrastar:play-song` | `PlaySongPayload` (existing) | DJ → Beamer | Includes `playerIds` |
| `ultrastar:game-tick` | `{ players: { id, records: FrequencyRecord[] }[], currentBeat: number }` | DJ → Beamer | ~60fps, delta only |
| `ultrastar:game-end` | `{ players: { id, name, score, scoreDetails }[] }` | DJ → Beamer | All players, both beamers |
| `ultrastar:stop-song` | `null` (existing) | DJ → Beamer | |
| `ultrastar:pause-song` | `null` (existing) | DJ → Beamer | |
| `ultrastar:resume-song` | `null` (existing) | DJ → Beamer | |

### Score screen

On `ultrastar:game-end` (or early stop), **both** beamer windows switch to a score screen.
The score screen shows **all players** ranked — regardless of which beamer they played on.
This lives in `BeamerView.svelte` as a different render mode (`gameStatus === 'ended'`).

---

## 10. Key Differences from allkaraoke

| Topic | allkaraoke | UltrastarDJ |
|---|---|---|
| Framework | React | Svelte 5 |
| State | Custom class + events | Svelte 5 runes |
| Rendering | Canvas (CanvasDrawing class) | Canvas in Svelte component |
| Remote mic | WebRTC (phone as mic) | Not planned (local USB mics via Rust cpal) |
| Multiplayer | Network (WebRTC) | Local only (multiple USB mics) |
| Audio | YouTube iframes | Local files + YouTube |
| Pitch lib | aubiojs | aubiojs (same) |
| Max score | 3,500,000 | 3,500,000 (same) |
