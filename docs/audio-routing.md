# Audio Routing in UltrastarDJ

## Overview

UltrastarDJ has two audio channels:

- **Game channel** — the live karaoke song playing for singers. Always routes to the **system default output** (set in macOS System Settings / Windows Sound Settings). Not configurable in the app.
- **Preview channel** — the DJ's private cue to listen to the next song. Routes to a **selectable output device**. Defaults to system default if no separate device is configured.

---

## How It Works Under the Hood

### mp3 / mp4 songs (full control)

```
<audio>/<video> element
  → Web Audio MediaElementSource
  → GainNode          (volume fader)
  → AnalyserNode      (level meter)
  → AudioContext.destination  (default output)
  OR
  → cpal Rust stream  (selected device, macOS)
  OR
  → setSinkId()       (selected device, Windows/Chromium)
```

The audio flows through our Web Audio graph, giving us full control: volume, metering, and device routing.

### YouTube-only songs (limited control)

YouTube audio plays inside a cross-origin `<iframe>`. JavaScript cannot intercept or redirect iframe audio. The iframe sends audio directly to the OS default output, bypassing our Web Audio graph entirely.

Current behaviour:
- Volume: controlled via YouTube Player API (`player.setVolume()`) — fader works
- Level meter: not available — meter segments are visually grayed out
- Device routing: not available — always plays on system default

> **Future sprint:** Extract YouTube stream URL via yt-dlp, load into native `<audio>` element, full Web Audio control applies.

---

## Physical Setup Options

The DJ needs **two separate audio outputs** for private headphone cueing. Any of these setups work:

### Option 1 — Built-in headphone jack + Bluetooth headphones *(€0 extra)*
- **Speakers / PA** → MacBook 3.5mm headphone jack
- **DJ preview** → Bluetooth headphones
- macOS/Windows sees both as separate devices automatically ✅

### Option 2 — Built-in speakers + USB audio dongle *(€5–15)*
- **Speakers** → MacBook built-in speakers
- **DJ preview** → USB-C or USB-A audio dongle → headphones
- Both appear as separate devices ✅

### Option 3 — Headphone jack + USB audio dongle *(€5–15)*
- **Speakers / PA** → 3.5mm jack → powered speakers or PA
- **DJ preview** → USB audio dongle → headphones
- Best for laptop DJs without internal speakers ✅

### Option 4 — macOS Aggregate Device *(free, built-in — advanced)*
- Open **Audio MIDI Setup** (`/Applications/Utilities/`)
- Create an aggregate device combining two physical outputs
- The aggregate device appears as a single device in the OS
- ⚠️ UltrastarDJ cannot route to specific channels of an aggregate device — both channels get the same audio
- **Not recommended** — use a USB dongle (Option 2/3) instead

### Option 4b — Bluetooth headphones *(€0 extra, with caveat)*
- Connect BT headphones → macOS sets them as system default automatically
- Go to **System Settings → Sound → Output** → set speakers back as default
- ⚠️ Known macOS/cpal limitation: BT headphones may disappear from the preview selector when they are not the system default
- **Workaround**: keep BT as system default and select your speakers as the preview device instead (reversed roles) — or use a USB dongle for reliable routing

### Option 5 — Dedicated DJ USB audio interface *(€80–200)*
- e.g. Native Instruments  , Pioneer DJ interface
- Designed for exactly this workflow: separate master + cue outputs
- Appears as two stereo devices automatically, no setup needed ✅
- Also provides the most reliable low-latency audio ✅

---

## Device Detection

The **Preview** device selector in the Audio Output panel lists all audio output devices currently detected by the OS:

- **macOS**: devices are enumerated via `navigator.mediaDevices.enumerateDevices()` and the Rust `cpal` backend (`list_audio_output_devices` command). Both USB and Bluetooth devices appear once connected.
- **Windows**: same enumeration; `setSinkId()` is used instead of cpal for routing.

**No manual detection of "required setup" is needed** — if a device is connected and the OS recognises it, it appears in the list. If only one output is available (system default), the selector shows only "System default" and the DJ knows they need a second device for private cueing.

### What the UI enforces

| Channel | Device selector | Behaviour |
|---|---|---|
| **Game** | Fixed — system default | No selector shown. Game audio always follows OS default. |
| **Preview** | Selectable | Lists all available output devices. Defaults to system default if nothing is selected. |

---

---

## Mic Input Signal Chain

Each player's mic is captured via a dedicated cpal input stream (one per player). The full chain, from hardware to speaker and pitch scorer:

```
Mic hardware
  → cpal input callback (f32/i16/u16 format)
  → channel extract (left / right / mono)
  → soft saturation: x / (1 + |x|)    ← prevents hard clipping
  → input gain (dB-linear, hot-reload)
  → noise gate (RMS-based, hot-reload)
  → ring buffer → cpal output (mic-mix channel)  ← monitor speaker
  → RMS event → JS mic level meter
  → JS pitch detector → pitch scoring
```

### Input Gain

- Range: 0–100% fader = 0× to 1.0× (no boost, only attenuation)
- Taper: **dB-linear** — `gain = 10^(1.5 × (v − 1))` where v is 0–1
  - 100% = 0dB (unity), 90% ≈ −3dB, 0% = silence (−∞)
  - Each 10% step is a perceptually equal ~3dB change
- Hot-reload: changing the fader updates the `mic_input_gains` map in Rust — no stream restart needed

### Noise Gate

- Comparison signal: **RMS** of the post-gain mono frame
- Open threshold: `rms >= threshold`
- Close threshold (hysteresis): `rms >= threshold × 0.5` while gate is open
- Hot-reload: dragging the threshold handle updates `mic_thresholds` map in Rust — no stream restart needed
- During "Test mic" mode: threshold is seeded as **0** (gate bypassed) so audio flows freely while the user calibrates the fader. The threshold handle still moves and saves to the store for use during gameplay.

### Meter Display

The level meter uses a log scale to match human loudness perception:

```
displayPos = clamp((20 × log10(rms) + 40) / 40 × 1.5, 0, 1)
```

- Floor: −40 dBFS → displayPos = 0
- 0 dBFS → displayPos = 1.5 (clips into red)
- ×1.5 boost ensures a loud singing voice hits the red zone

The threshold handle uses the **same formula** for its position, so placing it at 20% on the bar cuts signals showing at 20% on the meter.

### Mic Delay Compensation

`micDelay` (ms, global setting) compensates for hardware latency in **pitch scoring only** — no audio buffering:

```
delayBeats = (micDelayMs / 1000) × (bpm / 60) × 4
evalBeat   = currentBeat − delayBeats
```

At 120 BPM, 80 ms delay ≈ 0.64 beats. The pitch evaluator looks up which note was active at `evalBeat` instead of `currentBeat`, so late-arriving audio is still scored against the correct note.

---

## Platform Notes

| Feature | macOS | Windows |
|---|---|---|
| Device routing (mp3/mp4) | ✅ cpal | ✅ setSinkId |
| Volume control (mp3/mp4) | ✅ Web Audio GainNode | ✅ Web Audio GainNode |
| Level metering (mp3/mp4) | ✅ AnalyserNode | ✅ AnalyserNode |
| Device routing (YouTube) | ❌ iframe limitation | ❌ iframe limitation |
| Volume control (YouTube) | ⚠️ YT Player API only | ⚠️ YT Player API only |
| Level metering (YouTube) | ❌ meter grayed out | ❌ meter grayed out |
| Aggregate device support | ✅ Audio MIDI Setup | ✅ Windows built-in |
| WASAPI loopback (future) | n/a | 🔶 planned |
| CoreAudio tap (future) | 🔶 macOS 14+, planned | n/a |
