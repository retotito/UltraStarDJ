# Mic Delay Calibration Notes

## What mic delay means

`micDelayMs` is the round-trip latency from audio output → air → microphone input.
It shifts the pitch evaluation window backward so that sung notes are matched against the correct beat.

Visually: the sung fill appears `micDelayMs` behind the playhead. This is correct — the fill shows
what the mic detected, which is always `micDelayMs` late.

---

## Reference measurement

| Player | Mic | Measured delay |
|--------|-----|---------------|
| Player 1 | USB mic (test) | **99 ms** |
| Player 2 | Second mic (test) | **119 ms** |

These were measured using the built-in latency test dialog (beep → echo detection).

---

## Visual reference: 99ms → ~82px at 1920px lane width

Formula:
```
pixels = (micDelayMs / phraseDurMs) × laneWidthPx
```

Example (99ms, 2.32s phrase, 1920px lane):
```
99 / 2320 × 1920 = ~82px
```

This is screen-resolution dependent. The red indicator line in `NoteLane.svelte` uses the CSS
animation timing (time-based), which scales correctly on all resolutions.

### Hardcoded offset for testing

File: `src/components/game/NoteLane.svelte`  
CSS class: `.delay-indicator`  
Current value: `left: -100px` ← **temporary test offset, remove before production**

This was added to visually verify calibration at 1920px. It approximates 99ms at that resolution
but is NOT resolution-independent.

---

## Red indicator line

The red line is a second CSS animation (`playhead-slide`) running with a `micDelayMs / 1000`
second additional delay compared to the white playhead line.

It shows the **expected position of the fill's right edge** when correctly calibrated.

When singing:
- Fill right edge touches the red line → mic delay is correctly calibrated ✓
- Fill right edge is behind the red line → `micDelayMs` is set too high
- Fill right edge is ahead of the red line → `micDelayMs` is set too low

---

## Next step: clip fill at red line

The fill's right edge should be clipped at the red indicator position (= playhead - micDelayMs).
This prevents the fill from visually overshooting the playhead.

Implementation: use a `clip-path` or `overflow: hidden` on the note bar, with the clip boundary
set at `(playheadFrac - micDelayFrac) × 100%` of the bar width.

This effectively hides the "future" part of the fill that hasn't been confirmed by the mic yet.
