# Case 2 — MP3 + MP4 Video

## Song format

```
#TITLE:Test-MP3-MP4
#ARTIST:Test
#MP3:song.mp3
#VIDEO:video.mp4
#BPM:120
#GAP:0
```

## Architecture

### Audio source
`GameAudio` plays the MP3 file. It registers `audioEl.currentTime` as the
playback time provider. All sync is relative to audio time.

### Video background
`BeamerBackground.svelte` loads the video file via Tauri's asset protocol
(`media://localhost/<absolute-path>`). Tauri's Rust side serves the file with
the correct `Content-Type` header and supports `Range` requests for seeking.

The beamer's `<video>` element plays muted. Drift is corrected by a `$effect`
that runs on each `currentTime` tick:

```ts
const drift = Math.abs(videoEl.currentTime - currentTime)
if (drift > 0.5) videoEl.currentTime = currentTime
```

### Pre-buffering
When a song with `videoPath` is loaded (`playback.load()`), `isBuffering = true`
and beamer preview is sent. `BeamerBackground` mounts the `<video>` element and
waits for `canplaythrough`. When that fires, it emits `beamer-ready` via IPC,
which sets `isBuffering = false` → play button becomes enabled.

### Unsupported formats (MPG, AVI, MKV, etc.)
WebKit's HTML5 decoder cannot play MPEG-2, AVI, MKV, WMV, or FLV files.

**In the preview player (PlayerWidget):**
When `needsTranscode(song.videoPath)` returns true, a "Converting video…" spinner
overlay is shown while `transcodeToMp4(song.videoPath)` runs. This calls the
Tauri `transcode_to_mp4` command which invokes the bundled FFmpeg:

```
ffmpeg -i <input> -c:v libx264 -preset ultrafast -crf 28 -c:a aac -movflags +faststart
```

The temp MP4 is written to the system temp dir and deleted when the song changes.

**In the beamer (BeamerBackground):**
The same technique needs to be applied: detect unsupported extension, transcode
via `transcodeToMp4()`, use the temp path for the `<video>` src.

> ⚠️ **Open issue**: BeamerBackground currently loads `song.videoPath` directly.
> For unsupported formats, a transcoded temp file must be passed via IPC payload
> or triggered from the beamer side. The cleanest approach is to transcode on the
> DJ side at `playback.load()` time (same as PlayerWidget) and store the
> `transcodedVideoPath` on the song/playback state, then pass it in the
> `play-song` IPC payload.

## Expected behavior

| Step | Result |
|---|---|
| Load song | Beamer screen unchanged |
| Hitting Preview (TV button) | Spinner on play button while video buffers |
| `canplaythrough` fires | Spinner disappears, play button enabled |
| After countdown | Video plays fullscreen muted on beamer, lyrics overlay on top |
| Video/audio sync | Seek-sync effect corrects drift > 0.5s every tick |
| 2 beamers | ~90ms IPC offset (acceptable) — both receive same `currentTime` |
| Pause | Audio pauses, `videoEl.pause()` called |
| Resume | Audio resumes, `videoEl.play()` called, seek-sync re-aligns |
| DJ preview player | Plays from the same video file (or transcoded temp) |

## Unsupported format detection

```ts
// src/lib/ipc/tauri.ts
export const NEEDS_TRANSCODE_EXTS = new Set(['mpg', 'mpeg', 'avi', 'mkv', 'wmv', 'flv'])
export function needsTranscode(path: string): boolean { … }
export async function transcodeToMp4(input: string): Promise<string> { … }
export async function deleteTempFile(path: string): Promise<void> { … }
```

## Known issues / open work

| Issue | Status |
|---|---|
| Beamer does NOT transcode unsupported formats | 🔴 open — needs same transcode flow as PlayerWidget |
| ~90ms beamer-to-beamer IPC offset | acceptable — not fixable without complex sync protocol |
| `#VIDEOGAP` support for audio/video alignment | planned — pitch detection sprint |
