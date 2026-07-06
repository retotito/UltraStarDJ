# Game Play — Beamer Rendering & Pitch Scoring

## Overview

This document covers everything needed to implement live karaoke game play on the beamer:
pitch detection from microphones, matching sung pitches to notes, scoring, and rendering.

Reference implementations studied:
- [allkaraoke.party](https://github.com/Asvarox/allkaraoke) — Canvas-based, React
- [tuneperfect](https://github.com/ZerNico/tuneperfect) — CSS Grid-based, SolidJS + Tauri (closer to our stack)
- [UltraStar Format Spec](https://github.com/UltraStar-Deluxe/format) — official format specification

---

## Two Separate Visual Elements

### 1. Lyrics display (already implemented)
`LyricsRenderer.svelte` — text only, shown at the bottom of the beamer screen.
- Current phrase: big text, syllables highlight as beat progresses
- Next phrase: small, dimmed below — so singers can prepare
- No pitch involved — only timing (beat position vs note start/end)
- Word spacing comes from leading/trailing spaces in `note-text` (preserved by `line.split(' ')`)

### 2. Note lane / pitch display (to implement)
A visual grid above the lyrics showing the **pitch and timing** of each note as a bar:
- Width = note duration in beats
- Vertical position = note pitch (higher pitch = higher row)
- Color = note type (normal = white/grey, golden = yellow)
- One note lane per player, stacked top-to-bottom on the beamer
- **Syllable text is rendered inside each note bar** — singers read lyrics off the bars

Both use the same `Note[]` data (`startBeat`, `lengthBeats`, `pitch`, `syllable`).

---

## UltraStar Format — Key Facts

### Timing
- `#BPM` is **implicitly quadrupled**: `#BPM 120` = 480 beats/minute
- `beatLengthMs = 60000 / (bpm * 4)` — duration of one beat in ms
- `#GAP` = milliseconds from audio start until beat 0 (all notes are relative to this)
- `#VIDEOGAP` = seconds to offset video vs audio (negative = skip video start)
- `#START` / `#END` = audio clip range (don't affect note beat positions)

### Pitch encoding
- Pitch = **half-steps relative to C4** (middle C = 0)
  - `pitch 5` = F4, `pitch -2` = A#3, `pitch 12` = C5
- For scoring: compare **octave-independently** (mod 12) — a singer an octave off still scores

### Note types

| Char | Type | Scoring |
|---|---|---|
| `:` | Normal | Full points |
| `*` | Golden | Double points |
| `F` | Freestyle | No points, no pitch check |
| `R` | Rap | Points for any sound (no pitch) |
| `G` | Golden Rap | Rap + bonus points |

### Phrases (line breaks)
- `-` marker = end-of-phrase → line break in lyrics display
- `P1` / `P2` = voice changes for duets (each voice = separate note track)
- `#RELATIVE yes` = legacy relative beat mode (rare — detect and warn, don't crash)

### Word spacing (spec-compliant)
A trailing space on a syllable (`"lo "`) or leading space on the next (`" world"`) marks a
word boundary. The parser MUST NOT strip these spaces. We use `line.split(' ')` (no trim)
which preserves them, matching the allkaraoke.party approach.

---

## Architecture

```
DJ Window
  ├── getUserMedia() → mic streams (one per player)
  ├── Web Audio: AnalyserNode (fftSize 2048)
  ├── AubioJS pitch detection → FrequencyRecord { timestamp, frequencyHz }
  ├── PitchProcessor (per player)
  │     ├── frequency → UltraStar pitch (Hz → semitone relative to C4)
  │     ├── distance = |sung - target| mod 12 → folded to [0, 6]
  │     ├── tolerance check (easy=2, medium=1, hard=0.5 semitones)
  │     └── joker: one-frame miss forgiveness
  ├── ScoreLoop: accumulate hit beats → live score
  └── Tauri IPC → emit FrequencyRecord deltas to Beamer(s) at ~60fps

Beamer Window(s)
  ├── Receive play-song IPC → Song data + playerIds
  ├── Receive game-tick IPC → new FrequencyRecords per player
  ├── Reconstruct sung notes locally
  ├── Render note lane (CSS Grid) per assigned player
  ├── Render LyricsRenderer with currentBeat
  └── On game-end IPC → render score screen
```

**Rule: DJ window = game engine. Beamers = dumb displays.**
Microphones are on the DJ's machine. `getUserMedia()` runs in the DJ WebView only.

---

## Pitch Detection

**Library:** [aubiojs](https://github.com/qiuxiang/aubiojs) — WebAssembly YIN algorithm.

```ts
import aubiojs from 'aubiojs'
const { Pitch } = await aubiojs()
const detector = new Pitch('default', 2048, 256, audioContext.sampleRate)
detector.setTolerance(0.5)

// setInterval every ~23ms:
const buffer = new Float32Array(2048)
analyser.getFloatTimeDomainData(buffer)
const hz = detector.do(buffer)  // 0 = silence
```

**Frequency → UltraStar pitch (half-steps relative to C4=0):**
```ts
function hzToUsPitch(hz: number): number {
  return 12 * Math.log2(hz / 261.63)  // 261.63 Hz = C4
}
```

**Distance (octave-independent):**
```ts
function calcDistance(hz: number, targetPitch: number): number {
  const sung = hzToUsPitch(hz)
  const diff = Math.abs(sung - targetPitch) % 12
  return diff > 6 ? 12 - diff : diff  // fold to [0, 6]
}
// hit if distance <= tolerance (easy=2, medium=1, hard=0.5)
```

**Input lag:** subtract ~180ms from timestamps when matching beats to mic input.

---

## Note Lane Rendering (CSS Grid)

Inspired by tuneperfect. Pure CSS Grid — no canvas needed.

### Layout

One grid per player:
```
grid-template-rows:    repeat(ROW_COUNT, 1fr)    // 12–16 pitch rows
grid-template-columns: repeat(phraseBeats, 1fr)  // one column per beat in phrase
```

`ROW_COUNT` = 16 for 1–2 players, 12 for 3–4 players (compact).

### Note → grid position

```ts
const startBeat = phrase.notes[0].startBeat
// For each note:
const column  = note.startBeat - startBeat + 1   // 1-indexed
const colSpan = note.lengthBeats
const row     = pitchToRow(note.pitch, avgPhrasePitch, ROW_COUNT)
```

**Pitch → row (with octave wrapping):**
```ts
function pitchToRow(pitch: number, avg: number, rowCount: number): number {
  let p = pitch
  const min = Math.floor(avg - rowCount / 2)
  const max = min + rowCount - 1
  while (p > max) p -= 12
  while (p < min) p += 12
  const offset = p - avg
  return Math.abs(Math.ceil(rowCount / 2 + offset) - rowCount) - 1
}
```

### Two grid layers (overlapping, same grid)

**Layer 1 — Target notes** (what to sing):
- White/grey rounded bar for normal notes
- Yellow bordered bar for golden notes
- Dashed border for rap notes
- Syllable text centered inside each bar

**Layer 2 — Sung notes** (what the player sang, colored):
- Fills left-to-right as beat progresses through the note
- SVG bezier curve showing precise pitch accuracy within bar
- Only shown when `distance <= tolerance`

---

## Lyrics Sweep Animation (upgrade for LyricsRenderer)

Currently: whole syllable snaps color when beat reaches it.

Upgrade (tuneperfect style — gradient sweep):
```svelte
<!-- percentage = (currentBeat - note.startBeat) / note.lengthBeats * 100 -->
<span style="
  background-image: linear-gradient(to right, {playerColor} {pct}%, white {pct}%);
  background-clip: text;
  color: transparent;
  white-space: pre;
">{note.syllable}</span>
```

---

## Scoring

Max score: **10,000** per song (simple, user-friendly).

```
pointsPerBeat = 10000 / totalSingableBeats
```

| Hit type | Points |
|---|---|
| Normal note, beat hit (distance ≤ tolerance) | pointsPerBeat |
| Golden note, beat hit | pointsPerBeat × 2 |
| Rap/Golden Rap, any sound | pointsPerBeat |
| Freestyle | 0 |
| Miss | 0 |

Score recalculated live each tick from accumulated hit beats.

### Phrase ratings (nice-to-have)
After each phrase: **Perfect / Great / Good / Okay / Miss** badge based on % beats hit.

---

## IPC Event Contract

| Event | Payload | Direction |
|---|---|---|
| `ultrastar:play-song` | `PlaySongPayload` (existing) | DJ → Beamer |
| `ultrastar:game-tick` | `{ players: { id, records: FrequencyRecord[] }[], currentBeat: number }` | DJ → Beamer |
| `ultrastar:game-end` | `{ players: { id, name, score }[] }` | DJ → Beamer |
| `ultrastar:stop-song` | `null` | DJ → Beamer |
| `ultrastar:pause-song` | `null` | DJ → Beamer |
| `ultrastar:resume-song` | `null` | DJ → Beamer |

DJ sends only **new** FrequencyRecords each tick (delta). Beamer reconstructs locally.

---

## Players per Beamer

| Count | Layout |
|---|---|
| 1 | Full height — one note lane + lyrics at bottom |
| 2 | Split: top note lane + lyrics, bottom note lane + lyrics |
| 3–4 | Quarter splits (two per beamer max recommended) |

---

## Implementation Plan

### Phase 1 — Lyrics sweep animation
- [x] Syllable active/past classes (done)
- [ ] Upgrade to gradient sweep (left-to-right fill per syllable)

### Phase 2 — Note lane (target notes only, no mic yet)
- [ ] `src/components/game/NoteLane.svelte` — CSS Grid, target note bars with syllables
- [ ] Wire into `BeamerView.svelte` — one lane per assigned player, stacked

### Phase 3 — Progress bar
- [ ] `src/components/game/SongProgress.svelte` — thin bar, currentBeat / totalBeats

### Phase 4 — Pitch detection (DJ window)
- [ ] `npm install aubiojs`
- [ ] `src/lib/game/pitch-detector.ts`
- [ ] `src/lib/game/mic-input.svelte.ts`
- [ ] `src/lib/game/pitch-processor.ts`
- [ ] `src/lib/game/score-loop.ts`

### Phase 5 — Wire DJ → Beamer
- [ ] DJ: emit `ultrastar:game-tick` at 60fps
- [ ] Beamer: receive ticks, render sung note overlay on note lane

### Phase 6 — Score display & end screen
- [ ] Live score in BeamerView corner
- [ ] Score screen on `ultrastar:game-end`
- [ ] Phrase ratings (nice-to-have)

---

## Files to Create

```
src/
  lib/
    game/
      pitch-detector.ts       ← AubioJS wrapper
      mic-input.svelte.ts     ← getUserMedia + AnalyserNode + interval
      pitch-processor.ts      ← hz → distance → hit/miss + joker
      score-loop.ts           ← hit beats → live score
      game-engine.svelte.ts   ← ties everything together
  components/
    game/
      NoteLane.svelte         ← CSS Grid note lane
      SongProgress.svelte     ← progress bar
      ScoreDisplay.svelte     ← live score per player
      PhraseRating.svelte     ← "Perfect!" badge (Phase 6)
```
