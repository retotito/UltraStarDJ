# Case 6 — MP4 Only (no MP3)

## Song format

```
#TITLE:Test-MP4-Only
#ARTIST:Test
#VIDEO:video.mp4   ← or .mpg / .avi / .mkv (auto-transcoded)
#BPM:120
#GAP:0
```

No `#MP3` or `#AUDIO` tag. The video file is the only media source — both
audio and visual come from the same file.

---

## Architecture

### Audio source
`GameAudio` derives `audioSrc` as:

```ts
const audioSrc = $derived.by(() => {
  const s = playback.song
  if (!s) return null
  if (s.audioPath) return toAssetUrl(s.audioPath)
  if (s.videoPath) return toAssetUrl(s.videoPath)   // ← Case 6: MP4 audio fallback
  return null
})
```

Because there is no `audioPath`, `GameAudio` falls back to `videoPath`. It mounts
a hidden `<audio src=video.mp4>` — the browser extracts the audio track and plays
it. `audioEl.currentTime` is registered as the time provider.

### Visual source (beamer)
`BeamerBackground` sees `bgType = 'video'` (because `song.videoPath` is set).
It mounts a `<video>` element (muted) that plays the same file. The drift-sync
`$effect` keeps the beamer video aligned with `GameAudio`'s audio time:

```ts
const targetTime = currentTime + (song.videoGap ?? 0)
const drift = Math.abs(videoEl.currentTime - targetTime)
if (drift > 0.5) videoEl.currentTime = targetTime
```

### Why two elements for the same file?
- `GameAudio`'s `<audio>` is the **time authority** (its `currentTime` drives
  all lyrics and sync logic). It plays audio.
- `BeamerBackground`'s `<video>` is the **visual output** on the projector (muted).
- Keeping them separate means pause/resume/seek can be applied independently and
  the drift-sync loop acts as the synchronisation mechanism.

### Pre-buffering
`VideoPreloader` (in the DJ window) preloads `song.videoPath` and fires
`playback.setBufferingDone()` on `canplaythrough`. This unblocks the play button.

On the beamer side, `BeamerBackground` waits for `canplaythrough` on its own
`<video>` element and sends `beamer-ready` via IPC.

Both signals are needed before play is fully enabled.

### Unsupported formats (MPG, AVI, MKV, etc.)
WebKit cannot decode MPEG-2, AVI, MKV, WMV, or FLV. When `needsTranscode(song.videoPath)`
returns true, `playback.load()` runs FFmpeg transcoding **before** setting state:

```ts
if (song.videoPath && needsTranscode(song.videoPath)) {
  const tempPath = await transcodeToMp4(song.videoPath)
  song = { ...song, videoPath: tempPath }  // replaces in-memory — both audio and video use temp
}
```

FFmpeg is bundled in `src-tauri/resources/ffmpeg`:
```
ffmpeg -i <input> -c:v libx264 -preset ultrafast -crf 28 -c:a aac -movflags +faststart
```

The temp MP4 path is stored in `_transcodedPath` and deleted when `dismiss()` is
called. Both `GameAudio` and `BeamerBackground` receive the transcoded path via
the updated `song.videoPath` in the IPC payload.

### `#VIDEOGAP`
`#VIDEOGAP` (in seconds) offsets the beamer video relative to audio time:

```
currentTime = 5s, videoGap = 10s → beamer video seeks to 15s
```

For Case 6 (same file for audio and video) this is unusual — the audio and video
tracks are the same content, so a `videoGap` would desync them intentionally. It
is valid UltraStar syntax and the code handles it correctly, but in practice
Case 6 songs rarely use `#VIDEOGAP`.

### `#END`
`GameAudio`'s `timeupdate` listener stops playback at `song.end / 1000` seconds:

```ts
if (audioEl.currentTime >= endSecs) playback.stop()
```

---

## Data flow

```
playback.load(song)
  └─ needsTranscode? → transcodeToMp4() → song.videoPath = tempPath
  └─ isBuffering = true
  └─ state.song = song

VideoPreloader (DJ window)
  └─ <video src=videoPath preload=auto>
  └─ canplaythrough → playback.setBufferingDone() → isBuffering = false

playback.play()
  └─ startTick()
  └─ sendPlaySong() → beamer windows

GameAudio (DJ window)
  └─ audioSrc = toAssetUrl(song.videoPath)
  └─ <audio src=videoPath> (audio track only)
  └─ registerTimeProvider('GameAudio') → audioEl.currentTime drives all sync

BeamerBackground (beamer window)
  └─ bgType = 'video' → <video src=videoPath muted>
  └─ drift-sync $effect: |videoEl.currentTime - (currentTime + videoGap)| > 0.5s → seek
```

---

## Expected behavior

| Step | Result |
|---|---|
| Load MP4 song | Beamer unchanged, spinner on play button while buffering |
| `canplaythrough` fires | Spinner disappears, play enabled |
| Load MPG/AVI/MKV | "Converting…" spinner during transcode, then same as above |
| After countdown | Video plays fullscreen muted on beamer, audio from hidden `<audio>` |
| Audio/video sync | Drift-sync corrects > 0.5s every 100ms tick |
| Pause | `<audio>` pauses + `videoEl.pause()` |
| Resume | `<audio>` resumes + `videoEl.play()` + drift-sync re-aligns |
| Song ends naturally | `audio.ended` → `playback.stop()` → beamer score screen |
| `#END` tag | `timeupdate` listener stops at specified ms |
| Dismiss | Temp MP4 deleted from disk (`deleteTempFile`) |

---

## Known issues / caveats

- **Two loads of the same file**: the browser may or may not share the network
  cache between the `<audio>` and `<video>` elements. In practice with Tauri's
  asset protocol both requests are served from disk immediately.
- **Pause issue (open)**: if the beamer `<video>` pause `$effect` doesn't fire
  reliably, the video may continue while audio is paused. The effect depends on
  the `paused` prop propagating to `BeamerBackground`. Check issue #3 in
  test-cases-beamer-media.md.
