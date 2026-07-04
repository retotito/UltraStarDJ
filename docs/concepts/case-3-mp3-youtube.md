# Case 3 — MP3 + YouTube Background

## Song format

```
#TITLE:Test-MP3-YouTube
#ARTIST:Test
#MP3:song.mp3
#VIDEO:https://www.youtube.com/watch?v=VIDEO_ID
#BPM:120
#GAP:0
```

## Architecture

### Audio source
`GameAudio` plays the MP3 file. It registers the audio element's `currentTime` as the
playback time provider. The DJ tick broadcasts `currentTime` to all beamer windows.

### Video background
Each beamer window mounts a `YT.Player` (YouTube IFrame API JS library) via
`BeamerBackground.svelte`. The player is created inside a `<div>` that the API
replaces with a managed `<iframe>`.

Why `YT.Player` instead of a raw iframe + postMessage:
- Raw iframe postMessage requires the target origin to match the iframe's content origin
- In Tauri's WKWebView, the parent page origin is `http://localhost:1420`
- YouTube's origin is `https://www.youtube.com` → origin mismatch blocks postMessage
- `YT.Player` (loaded via `https://www.youtube.com/iframe_api`) manages the postMessage
  handshake internally and works from any origin

### Pause / resume
Controlled via `ytPlayer.pauseVideo()` / `ytPlayer.playVideo()` — direct IFrame API
calls, no postMessage issues.

### Sync strategy
A `$effect` in `BeamerBackground` runs on every `currentTime` tick (~1s):

```ts
const ytTime = ytPlayer.getCurrentTime()
const drift = Math.abs(ytTime - currentTime)
if (drift > 0.5) ytPlayer.seekTo(currentTime, true)
```

Both beamers independently snap to the DJ's audio clock. Initial startup drift
(one beamer opening slightly later) self-corrects within 1 tick. Sustained drift
stays < 0.5s.

### Pre-caching (planned)
Mount a hidden `YT.Player` in the DJ window at `playback.load()` time so YouTube
CDN starts buffering before the beamer opens. No UI blocking — YouTube has no
reliable `canplaythrough` equivalent. See `video-preload.md`.

## Expected behavior

| Step | Result |
|---|---|
| Load song | Beamer screen unchanged |
| Preview | No buffering spinner (YouTube can't signal canplaythrough) |
| Play → countdown done | YouTube plays muted as background, lyrics overlay on top |
| Audio/video sync | YouTube seeks to audio `currentTime` if drift > 0.5s |
| Pause | Audio pauses, `ytPlayer.pauseVideo()` called |
| Resume | Audio resumes, `ytPlayer.playVideo()` called, sync re-checked on next tick |
| 2 beamers | Both sync to same `currentTime` → < 0.5s difference |

## Known limitations

- No `canplaythrough` equivalent → no preload spinner, first playback may buffer briefly
- Two separate YouTube streams (one per beamer) — unavoidable due to cross-origin
  iframe restrictions (cannot capture/relay a YouTube stream between WebView windows)
- `#VIDEOGAP` support needed for precise audio/video alignment (planned)
