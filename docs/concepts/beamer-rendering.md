# Beamer Rendering Concept

## 1. What gets sent from DJ → Beamer, and when

### 1a. Song start (once)
Triggered when user presses Play in the DJ window.

```
Event: ultrastar:play-song
Payload: PlaySongPayload {
  song: {
    title, artist, bpm, gap,
    notes: NoteTrack[]   ← ALL phrases for ALL tracks, full song
  }
  ...
}
```
The beamer receives the complete song data once. It stores it and uses it for the entire song.

---

### 1b. Time tick (every 100ms via setInterval)
Used to keep the beamer's playback clock in sync with the DJ window's audio.

```
Event: ultrastar:time-tick
Payload: { currentTime: number }   ← seconds since song start
```
The beamer uses this to anchor its rAF-interpolated `smoothTime`.

---

### 1c. Pitch tick (every frame, ~60fps via rAF)
Sent while singing. Contains the latest pitch sample for each player.

```
Event: ultrastar:pitch-tick
Payload: PitchTickPayload {
  beat: number                  ← current beat position
  ticks: PitchTickEntry[]       ← one entry per active player
}

PitchTickEntry {
  playerId:       number
  midiNote:       number        ← latest detected pitch (-1 = silence)
  correct:        boolean       ← was this beat correct?
  isFirstInNote:  boolean       ← first beat of a new note (start new fill segment)
  noteType:       string        ← 'normal' | 'golden' | 'rap' | 'freestyle'
  rowPitch:       number        ← which row to visually show the mic dot on canvas
  score:          number        ← accumulated score so far
  maxScore:       number
}
```

**No `processedBeats` array.** The beamer does not need beat history because:

| Use case | What's needed | Source |
|---|---|---|
| Sung fill per note | Which note is being sung, is it correct | `beat` + `correct` in current tick |
| Rap hit indicator | Did any correct beat land in rap note range | Beamer tracks this incrementally |
| Fully-correct note glow | Were all beats in a note correct | Beamer tracks this incrementally |
| Perfect line flash | Were all beats in the phrase correct | Beamer tracks this incrementally |
| Score display | Current score | `score` field in tick |
| Mic dot position | Latest pitch row | `rowPitch` field in tick |

The beamer maintains its own state by appending each incoming tick — it never needs to re-process history.

**Current vs target payload size:**
- Current: ~9KB/frame (full `processedBeats` array mid-song, serialized over IPC)
- Target: ~100 bytes/frame (a few scalar fields per player)

---

## 2. Where the beamer stores received data

### 2a. Song / phrase data (static per phrase)
Stored as Svelte 5 runes in `BeamerView.svelte` / `NoteLane.svelte`.

```ts
// From play-song payload — full song, never changes during playback
const song = $state<Song | null>(null)

// Active phrase — $derived, recomputes when smoothTime crosses phrase boundary
// Returns same object reference while phrase is unchanged → $effects don't re-fire
const activeLine = $derived.by((): LyricLine | null => {
  // finds the current or next upcoming phrase from song.notes[trackIndex].lines
})

// Note cells for current phrase — $derived from activeLine
// Only recomputes on phrase switch (~every 5-10 seconds)
const cells = $derived.by((): NoteCell[] => {
  // maps each note to { note, leftPct, widthPct, topPct, heightPct, row }
})
```

### 2b. Per-note fill state (updated per beat, ~1-2 beats/frame)

```ts
// Keyed by note.startBeat — Svelte 5 Proxy tracks per-key changes
// Only the one div bound to noteStates[25] updates when beat 25 arrives
const noteStates = $state<Record<number, NoteState>>({})

type NoteState = {
  fillPct:  number    // 0–100, how much of the note bar is filled
  correct:  boolean   // true if any beat in this note was correct
  noteType: string
}

// Reset when phrase changes:
$effect(() => {
  const line = activeLine
  if (line !== _lastLine) {
    for (const k in noteStates) delete noteStates[k]
    _lastLine = line
  }
})

// Incremental update — runs on every pitch tick, O(1) per frame
$effect(() => {
  const tick = pitchTick
  if (!tick || !activeLine) return

  const beat     = tick.beat           // current beat position
  const note     = findNoteForBeat(activeLine, Math.floor(beat))
  if (!note) return

  const progress = (beat - note.startBeat) / note.lengthBeats
  noteStates[note.startBeat].fillPct  = Math.min(100, progress * 100)
  if (tick.correct) noteStates[note.startBeat].correct = true
  // track rap hits, fully-correct notes, perfect line incrementally here too
})
```

---

## 3. DOM structure — no CSS grid, all absolute

```
.note-lane  (position: relative, 100% × 100%, padding: --space-2 --space-4)
│
│   ← one .note-cell per note in the current phrase
│   ← only re-rendered on phrase switch
│
├── .note-cell  (position: absolute)
│     left:   (note.startBeat - phraseFirstBeat) / phraseBeats * 100%
│     width:  note.lengthBeats / phraseBeats * 100%
│     top:    (row - 1) / rowCount * 100%
│     height: 1 / rowCount * 100%
│
│     ├── .note-bar        ← background + border, always visible
│     │     golden:  CSS animation on opacity (GPU composited, no JS)
│     │     rap:     dashed border
│     │     freestyle: dotted border
│     │
│     ├── .note-fill       ← sung fill, width driven by noteStates[startBeat].fillPct
│     │     width: {noteStates[note.startBeat]?.fillPct ?? 0}%
│     │     color: player color (correct) or dimmed (incorrect)
│     │     clip-path: inset(0) → only the filled portion is visible
│     │
│     ├── .syllable        ← text label, static after phrase renders
│     │
│     └── .rap-badge / .freestyle-badge   ← static icons
│
└── <canvas>  (position: absolute, inset: 0, z-index: top, pointer-events: none)
      drawn in rAF loop, completely independent of Svelte reactivity
      draws: playhead vertical line
      future: mic pitch dot, score particles
```

---

## 4. How the fill works

### Beat-by-beat (not pixel-by-pixel)
The fill width is updated once per processed beat. A beat is a discrete unit (defined by the song's BPM). At BPM=120, one beat ≈ 125ms. The fill jumps in beat-sized steps.

```
note spans beats 25–30 (6 beats, 750ms at BPM=120)

beat 25 arrives → fillPct = 1/6 * 100 = 16.7%
beat 26 arrives → fillPct = 2/6 * 100 = 33.3%
...
beat 30 arrives → fillPct = 6/6 * 100 = 100%
```

### Is beat-by-beat smooth enough?
At BPM=120, each step is ~125ms. That's visible as a step, not a smooth fill.
At BPM=200 (fast songs), each step is ~75ms — better but still stepped.

### Smoothing options

**Option A — CSS transition (simplest)**
Add `transition: width 100ms linear` to `.note-fill`.
The browser interpolates between beat steps automatically. No JS cost.
Risk: transition doesn't know about phrase end — fill might animate past 100% briefly if not clamped.

**Option B — rAF-driven fill (smoothest, most control)**
Instead of setting `fillPct` directly in the $effect, set a target:
```ts
noteStates[key].targetFill = newPct
// In _tick() (rAF):
// lerp current fill toward target: fill += (target - fill) * 0.3
```
Gives the same smooth feel as the playhead. Fully decoupled from Svelte reactivity — canvas draws it.

**Option C — clip-path overlay (no fill width changes)**
Keep fill div at 100% width always.
Use a clip-path that reveals from left: `clip-path: inset(0 {100 - fillPct}% 0 0)`.
Advantage: width never changes → no reflow. Only clip-path changes → GPU composited.

**Recommendation: Option C** for correctness + Option A (CSS transition on clip-path) for smoothness.
`transition: clip-path 80ms linear` — GPU composited, zero JS per frame, smooth interpolation.

## 6. Playhead — working parameters (canvas implementation)

The canvas playhead works correctly. These are the parameters that must be preserved
when replacing canvas with a CSS div approach.

### Data sources
```
smoothTime       plain JS var (NOT $state) — updated in rAF loop:
                   smoothTime = min(_lastKnownTime + elapsed, smoothTime + 0.05)
                 _lastKnownTime is set from currentTime prop (10fps time-tick)

_phraseStartSec  plain JS var — set by $effect when activeLine changes:
                   notes[0].startBeat * (60/bpm/4) + gap/1000

_phraseDurSec    plain JS var — set by $effect when activeLine changes:
                   (lastNote.startBeat + lastNote.lengthBeats) * (60/bpm/4) + gap/1000 - _phraseStartSec
```

### Position calculation (runs every rAF frame, ~60fps)
```
frac = (smoothTime - _phraseStartSec) / _phraseDurSec   → 0.0 at phrase start, 1.0 at phrase end
x    = frac * canvasWidth                                → pixel position
```

### Canvas draw
```ts
_ctx.clearRect(0, 0, _cw, _ch)
if (frac >= 0 && frac <= 1) {
  x = frac * _cw
  // draw vertical line at x
}
```

---

## 7. CSS div playhead — final working implementation

### Why CSS animation instead of canvas/rAF
- Canvas/rAF runs on the JS main thread → blocked by IPC events (pitch ticks), causing visible jitter when singing
- CSS animation runs on the GPU compositor thread → completely immune to JS/IPC pressure
- `will-change: transform` promotes the element to its own GPU layer

### DOM structure
```
.lane-content (position: absolute, inset from padding)
  └── .playhead-line (position: absolute, top:0, bottom:0, left:0, width:100%)
        border-left: 2px solid white  ← the visible line
        will-change: transform
        animation: playhead-slide     ← set via JS inline styles
```

`translateX(0%)` = left edge = phrase start  
`translateX(100%)` = right edge = phrase end  
(Works because the element is `width: 100%` of container — 100% in translateX equals container width)

### @keyframes — must be global (in app.css, NOT in component `<style>`)
```css
@keyframes playhead-slide {
  from { transform: translateX(0%);   opacity: 1; }
  to   { transform: translateX(100%); opacity: 1; }
}
```
Reason: Svelte hashes `@keyframes` names inside `<style>` blocks. JS `style.animationName = 'playhead-slide'` would not match the hashed name. Global keyframe = no hashing.

### Trigger: audio-clock driven via $derived + $effect
```ts
const phraseActive = $derived(currentTime >= _phraseStartSec && _phraseDurSec > 0)

$effect(() => {
  if (!phraseActive || !playheadEl) return

  const elapsed   = untrack(() => currentTime) - untrack(() => _phraseStartSec)
  const phraseDur = untrack(() => _phraseDurSec)
  const animDelay = -Math.max(0, elapsed)   // seek to compensate for ≤16ms tick latency

  playheadEl.style.animationName           = 'none'
  playheadEl.style.animationDuration       = `${phraseDur}s`
  playheadEl.style.animationDelay          = `${animDelay}s`
  playheadEl.style.animationTimingFunction = 'linear'
  playheadEl.style.animationFillMode       = 'none'
  void playheadEl.offsetWidth              // force reflow to reset animation state
  playheadEl.style.animationName           = 'playhead-slide'
})
```

### Key lessons learned
- `untrack(() => currentTime)` — reads without registering as reactive dependency → effect only fires when `phraseActive` changes (once per phrase), NOT every 16ms tick. Without this, the effect fires 60fps and the animation resets continuously.
- `animationName = 'none'` + reflow + re-enable = standard browser technique to restart CSS animation on same element
- `fill-mode: none` = element returns to base style before/after animation
- `phraseActive` mirrors the canvas check: `frac >= 0` (audio-clock driven, not wall-clock)
- Time tick frequency = 16ms → `phraseActive` triggers ≤16ms after phrase start → `animDelay = -elapsed` seeks ≤0.7% of phrase width (imperceptible)

It **never reads** `pitchTick`, `noteStates`, or any pitch data.
Singing updates → DOM only → canvas is on its own GPU layer → never blocked.
