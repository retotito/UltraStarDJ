# Game View UI — Layout & Responsiveness

## Screen structure (playing state)

```
┌─────────────────────────────────────────────┐  ← 100vh
│  BeamerBackground (video/image, absolute)   │
│                                             │
│  playing-overlay (absolute, inset: 0)       │
│  ┌───────────────────────────────────────┐  │
│  │  lanes-area  (flex: 1, flex-col)      │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  lane-wrap  (flex: 1)  P1       │  │  │
│  │  │  ┌─────── NoteLane ──────────┐  │  │  │
│  │  │  │  CSS Grid note bars       │  │  │  │
│  │  │  └───────────────────────────┘  │  │  │
│  │  ├─────────────────────────────────┤  │  │
│  │  │  lane-wrap  (flex: 1)  P2       │  │  │
│  │  │  ┌─────── NoteLane ──────────┐  │  │  │
│  │  │  └───────────────────────────┘  │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  lyrics-area  (flex-shrink: 0)        │  │
│  │  ┌─── LyricsRenderer ──────────────┐  │  │
│  │  │  [lead-in 1fr][lyrics][1fr]     │  │  │
│  │  │  [next phrase, dimmed]          │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## Height distribution

`lanes-area` fills all space above the lyrics bar (`flex: 1`).
Each `lane-wrap` uses `flex: 1` — players share the space equally.

| Players on screen | Lane height (800px total, ~80px lyrics) |
|---|---|
| 1 | ~720px |
| 2 | ~355px each |
| 3 | ~233px each |
| 4 | ~173px each |

---

## Note lane grid

`NoteLane` fills its `lane-wrap` 100% via `height: 100%`.
The CSS grid uses `repeat(rowCount, 1fr)` — rows fill height automatically.

### Row count (pitch rows)
- 1–2 players: `rowCount = 16`
- 3–4 players: `rowCount = 12`

### Octave correction
UltraStar pitch = semitones relative to C4 (middle C = 0).
One octave = **12 semitones** (chromatic: C C# D D# E F F# G G# A A# B).
`rowCount = 12` fits exactly 1 octave; `rowCount = 16` adds ±2 semitones of range.

Pitch-to-row uses octave-wrapping: if a note is outside the visible window, it's
shifted ±12 until it fits, so songs with wide ranges still display cleanly.

### Effective row heights

| Players | rowCount | Lane height | Row height |
|---|---|---|---|
| 1 | 16 | ~720px | ~45px |
| 2 | 16 | ~355px | ~22px |
| 3 | 12 | ~233px | ~19px |
| 4 | 12 | ~173px | ~14px |

Minimum row height: `10px` (CSS `min-height` on `.note-bar` — readability floor).

---

## Syllable text visibility

Syllable text is rendered inside each note bar when `colSpan >= 2` beats.
At very small row heights (4-player), bars may be too short to read text — this is
acceptable since singers read the bottom lyrics bar instead.

---

## Lyrics bar (bottom)

Fixed height — content-sized (`flex-shrink: 0`). Stays at the very bottom.

```
[lead-in 1fr] [current phrase — max-content] [1fr]
[    next phrase (dimmed, smaller)           ]
```

- **Current phrase**: `clamp(1.4rem, 3.2vw, 2.8rem)`, bold
- **Next phrase**: `clamp(0.85rem, 1.8vw, 1.5rem)`, dimmed
- **Lead-in bar**: `0.9em` tall, blue `#4f8ef7`, sweeps right→left over 3s before phrase start
- **Background**: `rgba(0,0,0,0.55)` + `backdrop-filter: blur(4px)`

---

## Player colors

| Player | Color |
|---|---|
| P1 | `#4f8ef7` (blue) |
| P2 | `#f75f5f` (red) |
| P3 | `#4ecb71` (green) |
| P4 | `#f7c84f` (yellow) |

Golden notes always use `#ffd700` regardless of player color.

---

## Future: per-beamer layout

Players are assigned to beamers in the DJ window. Each beamer only renders the
lanes for its assigned players. So a 4-player game with 2 beamers = 2 lanes per
beamer (not 4 lanes on one screen).
