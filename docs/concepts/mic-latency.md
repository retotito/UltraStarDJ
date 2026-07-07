# Mic Latency / Delay Offset

## What is mic delay?

When a singer sings into a microphone, the audio travels through several stages before the pitch
detection code reads it:

```
Singer's voice
    │
    ▼
Microphone capsule          ~0 ms (physical)
    │
    ▼
USB / Audio interface       2–10 ms (driver round-trip)
    │
    ▼
OS audio buffer             5–30 ms (OS scheduler + buffer size)
    │
    ▼
Web Audio API / getUserMedia  5–20 ms (browser stack)
    │
    ▼
AnalyserNode getByteTimeDomainData()   ← pitch engine reads here
```

**Total typical range: 20–60 ms.** High-end USB interfaces can be as low as 10 ms. Cheap
built-in laptop mics over Bluetooth can be 100–200 ms.

---

## Is it noticeable?

| Delay | Perceptible? | Effect on scoring |
|---|---|---|
| < 20 ms | No | Negligible — within 1 beat at 180 BPM |
| 20–50 ms | Maybe | ~1 beat error at fast songs (180+ BPM) |
| 50–100 ms | Yes (score) | 1–3 beats off — clearly hurts scoring |
| 100–200 ms | Yes (visually) | Sung-note indicator appears on wrong note bar |
| > 200 ms | Very noticeable | Singer sees indicator lagging behind lyrics |

At 120 BPM a single UltraStar beat = **125 ms**. At 180 BPM it = **83 ms**.
So a 50 ms delay is roughly **0.4–0.6 beats** — half a note off at fast songs.
For casual karaoke this is usually fine. For competitive scoring it matters.

---

## Does each mic have a different delay?

Yes, potentially. Sources of per-mic variation:

- **Different USB interfaces** — each has its own driver buffer size
- **Bluetooth mics** — always significantly higher than wired (50–150 ms extra)
- **Same interface, different channels** — usually identical (< 1 ms difference, negligible)
- **Software mic (AirPods, headset)** — varies by device

### Practical reality for karaoke:

In most setups all 4 mics come from the **same USB audio interface** (e.g. a Behringer UMC404)
and will have identical latency. Per-mic delay settings are therefore a nice-to-have, not critical.
A single **global delay offset** covers 95% of cases.

---

## Can we measure it automatically?

**Browser:** Not directly. The Web Audio API does expose `AudioContext.baseLatency` and
`outputLatency`, but these measure *output* latency (speaker delay), not input latency.
`getUserMedia` streams have no standard latency property exposed to JS.

**What other apps do:**

| App | Approach |
|---|---|
| tuneperfect | Manual slider per mic, range 0–500 ms, default 0 ms |
| UltraStar Deluxe | Manual setting "MicDelay", range 0–500 ms, default 0 ms |
| Performous | Manual, also 0 default |
| RAWR | Auto-calibration: plays a test tone through speakers, records it back via mic, measures round-trip |

**Auto-calibration (RAWR method):**
1. Play a short click/beep through the output speakers
2. Record mic input simultaneously
3. Detect when the click appears in the mic signal → measure delta → that's the delay
4. Problem: measures *round-trip* (speaker + mic), not just mic input delay
   — requires knowing the speaker output delay separately, or a reference click at t=0

Auto-calibration is possible but adds significant complexity. USDX doesn't do it.

---

## Recommended approach for UltrastarDJ

### Phase 1 (implement now): Global delay slider
- One slider in **Settings → Audio** affecting all players
- Range: 0–300 ms, step 10 ms, default **0 ms**
- Applied in `pitchSession.tick()` as a beat offset: `delayedBeat = currentBeat - msToBeats(bpm, globalMicDelay)`
- Simple, covers the common case (all mics on same interface)

### Phase 2 (later): Per-mic delay override
- Optional per-player delay in PlayerCard (advanced section, collapsed by default)
- Falls back to global delay if not set
- Useful for: one Bluetooth mic + three wired mics

### Phase 3 (future): Auto-calibration wizard
- Settings page with a "Calibrate" button
- Plays a test tone, measures round-trip, subtracts known output latency
- Store as the global delay

---

## Implementation: how the beat offset works

The mic captures audio that the singer produced `delay` ms ago.
Instead of buffering audio, we shift the **comparison beat** backward:

```ts
// bpm here is UltraStar BPM (= quarter-BPM, so ×4 beats per second at bpm/60)
function msToBeats(bpm: number, ms: number): number {
  return (ms / 1000) * (bpm / 60) * 4
}

// In pitchSession.tick():
const delayedBeat = currentBeat - msToBeats(song.bpm, micDelay)
const targetNote  = findNoteAtBeat(track, delayedBeat)
```

This means: "the pitch I just detected was sung when the song was at `delayedBeat`,
not `currentBeat` — so compare it against the note that was playing then."

**No audio buffering. No DelayNode. Just index arithmetic.**

---

## Default delay: 0 ms

Starting at 0 ms is correct because:
- Many setups (wired USB interface) have low enough latency that it doesn't affect scoring
- It's better to let users opt-in than to pre-apply an incorrect offset
- tuneperfect and USDX both default to 0

A calibration tip could be shown after first song: "If your score seems low despite singing
correctly, try adjusting Mic Delay in Settings."
