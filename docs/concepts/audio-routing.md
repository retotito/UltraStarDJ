# Audio Routing — Concept & Architecture

## Goal

Route **game audio** and **preview audio** to independently selectable output devices (speakers/soundcards).  
Volume control and level metering are handled in JS (Web Audio API) on all platforms.  
Output device selection requires platform-specific work — see below.

---

## Two Audio Channels

| Channel | Audio source | Where volume lives | Output device |
|---------|-------------|-------------------|---------------|
| `game`    | `<audio>` in `GameAudio.svelte` (or `GameYouTube`) | NowPlayingBar fader | Configurable |
| `preview` | Plyr `<audio>` in `PlayerWidget.svelte` | PlayerWidget fader | Configurable |

Mic inputs are a separate topic (see `mic-routing.md`).

---

## Volume Control & Metering — JS Only (all platforms)

Works today without any Rust. Each channel gets a Web Audio graph:

```
<audio element>
  → MediaElementSource
  → GainNode          ← gain prop on HorizontalFader controls this
  → AnalyserNode      ← level prop on HorizontalFader reads from this (rAF loop)
  → AudioContext.destination
```

This is implemented in `src/lib/audio/AudioChannel.svelte.ts` (to be built).

---

## Output Device Selection — Platform Split

### Windows (WebView2 / Chromium)

`HTMLMediaElement.setSinkId(deviceId)` — works natively.  
`AudioContext({ sinkId })` — works natively.  
No Rust needed.

### macOS (WKWebView / WebKit)

`setSinkId()` is **not supported** in WebKit. Must go through Rust.

**Approach: Rust CoreAudio bridge**

1. Enumerate devices: `cpal::available_hosts()` + `host.output_devices()`
2. For each channel, hold a `cpal::Stream` that reads PCM from a ring buffer
3. JS side captures audio via `AudioWorkletProcessor` → sends PCM chunks to Rust via Tauri IPC
4. Rust writes chunks to the selected `cpal::Stream` → plays on the chosen device

This is non-trivial but isolated to the `src-tauri/src/audio/` module.

**Alternative (simpler, less flexible):**  
Use CoreAudio `kAudioHardwarePropertyDefaultSystemOutputDevice` to switch the macOS system default output before each play. Works but affects the whole system — not ideal.

---

## Implementation Plan

### Phase 1 — Volume & metering (no Rust, macOS + Windows)
- [ ] `src/lib/audio/AudioChannel.svelte.ts` — GainNode + AnalyserNode wrapper
- [ ] Wire `game` channel into `GameAudio.svelte`
- [ ] Wire `preview` channel into `PlayerWidget.svelte`
- [ ] Connect HorizontalFader in NowPlayingBar to game channel
- [ ] Connect HorizontalFader in PlayerWidget to preview channel

### Phase 2 — Device enumeration (Rust, all platforms)
- [ ] Add `cpal` to `Cargo.toml`
- [ ] Tauri command: `list_audio_outputs() → Vec<{ id: String, name: String }>`
- [ ] `src/lib/audio/devices.svelte.ts` — reactive device list, calls Rust on mount
- [ ] Sidebar icon `speaker` → opens `AudioOutputView` popup
- [ ] Two cards: Game / Preview, each with a `<select>` of available devices

### Phase 3 — Routing on Windows
- [ ] On device select: call `audioEl.setSinkId(deviceId)` (game channel)
- [ ] On device select: call Plyr's internal audio el `.setSinkId(deviceId)` (preview)
- [ ] Guard with feature detection: `'setSinkId' in HTMLMediaElement.prototype`

### Phase 4 — Routing on macOS (Rust AudioWorklet bridge)
- [ ] `AudioWorkletProcessor` in JS captures PCM from each channel
- [ ] Tauri command: `create_audio_stream(channel, device_id)` → opens cpal stream
- [ ] Tauri command: `push_audio_pcm(channel, samples: Float32Array)`
- [ ] JS worklet sends chunks via `invoke('push_audio_pcm', ...)`  on each process() call
- [ ] Rust writes to ring buffer → cpal stream plays on device

---

## File Structure

```
src/
  lib/
    audio/
      AudioChannel.svelte.ts   ← GainNode + AnalyserNode, reactive gain/level
      devices.svelte.ts        ← reactive list of output devices (from Rust)
      channels.svelte.ts       ← singletons: gameChannel, previewChannel
  components/
    views/
      AudioOutputView.svelte   ← sidebar popup: device cards for game + preview
src-tauri/
  src/
    audio/
      mod.rs                   ← cpal device enumeration + stream management
      ring_buffer.rs           ← lock-free ring buffer for PCM chunks
```

---

## Settings Persistence

Device IDs are stored in `settings.svelte.ts`:

```ts
interface AudioSettings {
  gameOutputDeviceId:    string | null  // null = system default
  previewOutputDeviceId: string | null
}
```

Persisted via Tauri `store` plugin (same as other settings).

---

## Key Risk

The AudioWorklet → Rust IPC path (Phase 4) introduces latency. Each `process()` call is 128 samples at 44100 Hz = ~2.9ms. IPC overhead per call could add 1–5ms. For game audio this may be acceptable; for preview (DJ headphone monitoring) it needs testing.

**Mitigation:** Use a larger buffer (512–1024 samples) to reduce IPC call frequency at the cost of ~10–23ms latency. Acceptable for preview playback.
