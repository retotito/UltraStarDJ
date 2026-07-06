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
