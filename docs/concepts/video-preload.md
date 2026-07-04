# Video Preload — Concept

## Goal
When a song with a video file is loaded into the game player, the video must be
fully buffered **before** the play/TV/home buttons become available.
Buffering happens entirely on the DJ side — independent of the beamer.

## Flow

```
User hits "Load" (PlayerWidget → playback.load())
  │
  ├─ song has videoPath + needsTranscode? (MPG, AVI, MKV, WMV, FLV)
  │     YES → set isBuffering = true
  │           await transcodeToMp4(song.videoPath)  ← FFmpeg, ~1-3s
  │           song.videoPath = tempMp4Path           ← mutate working copy
  │           (on error: clear videoPath, continue audio-only)
  │
  ├─ song has videoPath (now always MP4)?
  │     YES → set isBuffering = true
  │           mount hidden <video> element in NowPlayingBar (or AppShell)
  │           video starts preloading in background (no sound, display:none)
  │           wait for canplaythrough event
  │           canplaythrough fires → set isBuffering = false
  │           hidden video is destroyed (or kept for game use)
  │
  └─ song has NO videoPath → isBuffering stays false, buttons enabled immediately
```

## State: `isBuffering` (in `playback` store)

| Value | Meaning |
|---|---|
| `false` | No buffering needed, or buffering complete |
| `true` | Video is preloading — buttons disabled |

## UI rules while `isBuffering === true`

- Play button → disabled + spinning icon
- TV button (beamer preview) → disabled
- Home/clear buttons → disabled
- NowPlayingBar status text → "Buffering video…"

## What triggers the preload

- `playback.load(song)` — if `song.videoPath` exists, set `isBuffering = true` and
  emit an internal signal to mount the hidden video element.

## What ends the preload

- `canplaythrough` event on the hidden video element → `playback.setBufferingDone()`

## Preload strategy per song type

| Song type | Strategy | Spinner |
|---|---|---|
| Has `videoPath` | Hidden `<video>` in DJ window → wait for `canplaythrough` | Yes — buttons blocked until ready |
| Has `youtubeId` only | Mount Plyr YouTube (muted, paused) on load → no blocking signal available | No spinner — just starts buffering early |
| Audio only (MP3/M4A) | Nothing to preload | No spinner |

YouTube has no reliable `canplaythrough` equivalent via the IFrame API, so we
don't block the UI — we just start loading as early as possible and rely on the
preview/countdown time to finish buffering naturally.

## Notes

- The hidden `<video>` element lives in the DJ window only (not beamer)
- It uses the same `toAssetUrl(song.videoPath)` path as the beamer
- `isBuffering` is the flag name in the `playback` store
- `beamerReady` (IPC from beamer) is a separate concern — can coexist if needed later
- The Plyr YouTube preload element is separate from the PlayerWidget preview player
