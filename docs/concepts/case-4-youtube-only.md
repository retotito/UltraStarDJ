# Case 4 — YouTube Only (no MP3)

## Song format

```
#TITLE:Test-YouTube-Only
#ARTIST:Test
#VIDEO:https://www.youtube.com/watch?v=VIDEO_ID
#BPM:120
#GAP:0
```

Alternatively `#YOUTUBE:` tag also works (parser handles both):

```
#YOUTUBE:https://www.youtube.com/watch?v=VIDEO_ID
```

No `#MP3` or `#AUDIO` tag. No local audio file.

---

## Architecture

### Audio source
There is no local audio file. `GameAudio` derives `audioSrc` as:

```ts
const audioSrc = $derived.by(() => {
  const s = playback.song
  if (!s) return null
  if (s.audioPath) return toAssetUrl(s.audioPath)
  if (s.videoPath) return toAssetUrl(s.videoPath)  // MP4 audio fallback
  return null
})
```

`youtubeId` is not a `videoPath`, so `audioSrc` is `null`. The `<audio>` element
inside `{#if audioSrc}` never mounts → no time provider registered → `currentTime`
stays at 0 forever without additional work.

### DJ player audio
The DJ preview player (`PlayerWidget`) uses a Plyr instance. For YouTube songs,
Plyr loads a YouTube player with sound enabled. This is the only audio source.

**Key insight**: the Plyr YouTube player's `currentTime` must become the playback
time provider for the session.

### Time provider strategy
When `countdown-done` fires and the song has a `youtubeId` but no `audioPath`/`videoPath`,
the playback store must register a wall-clock or Plyr-based time provider instead of
the audio element.

Implemented: **Plyr `currentTime` provider** — inside `plyrYoutubeAction` in `PlayerWidget.svelte`,
when `isYoutubeOnly` is detected, `onCountdownDone` is registered. When it fires:

```ts
onCountdownDone(() => {
  playback.registerTimeProvider(() => instance.currentTime)
  Promise.resolve(instance.play()).catch(...)  // play() returns void for YouTube, not Promise
})
```

> **Important**: `Plyr.play()` returns `void` for YouTube (not `Promise<void>`). Use
> `Promise.resolve(instance.play()).catch(...)` to avoid TypeError.

### Beamer video background
Same as Case 3 (`BeamerBackground`): a `YT.Player` is mounted with `mute: 1`.
Sync strategy is identical — seek to `currentTime + videoGap` when drift > 0.5s.

### player.song sync
`playback.load()` now calls `player.load(song)` to keep the preview player in sync
with the loaded song. This is required for Case 4: the YouTube embed in `PlayerWidget`
only mounts when `player.song.youtubeId` is set. Without this sync, loading directly
from the song table would leave `player.song` stale and the YouTube embed would never
mount — so no Plyr instance, no time provider.

> This sync also benefits Cases 1–3 (preview player always reflects the loaded song).

### Negative beat values (pre-GAP notes)
UltraStar songs can have notes with **negative beat values** — these are notes that
start before the `#GAP` point. Example: `#GAP:16528` and a note at beat `-466` means
the note plays at approximately `16.528 - 466/40.8 ≈ 5.1s` into the audio.

The `LyricsRenderer` formula is:
```
currentBeat = (currentTime - gap/1000) * (bpm/60) * 4
```

Negative `currentBeat` values are valid and must NOT be clamped to 0. The original
`Math.max(0, ...)` was removed. `getActiveLine` also uses `firstNote.startBeat` (not
`line.startBeat`) as the lower bound, since the parser initializes `line.startBeat = 0`
for the first line regardless of actual first-note beat.

This fix applies to **all cases** (1–6), not just Case 4.

### DJ YouTube player
The DJ plays the same video with sound. The DJ-side player must:
- Start at `countdown-done` (not earlier — same timing contract as audio in Cases 1–3)
- Respect pause/resume/stop from `playback` state
- NOT be muted (the DJ hears the audio)

`PlayerWidget` currently loads a Plyr YouTube player for preview. For Case 4,
this same Plyr instance transitions from preview → game playback.

### Pause / resume
- DJ Plyr: `plyr.pause()` / `plyr.play()`
- Beamer YT.Player: `ytPlayer.pauseVideo()` / `ytPlayer.playVideo()`
- Both triggered by the same IPC events (`ultrastar:pause-song`, `ultrastar:resume-song`)

### Sync between DJ and beamer
The beamer's `$effect` snaps to `currentTime` (provided by Plyr) every tick:

```ts
const ytTime = ytPlayer.getCurrentTime()
if (Math.abs(ytTime - (currentTime + videoGap)) > 0.5)
  ytPlayer.seekTo(currentTime + videoGap, true)
```

The beamer lags the DJ by ~1 IPC round-trip (~90ms) — same as all other cases.

### Song end / #END
No `audio.ended` event. Options:
1. `YT.PlayerState.ENDED` event on the DJ Plyr YouTube player → call `playback.stop()`
2. `#END` tag: existing `timeupdate`-equivalent from Plyr's `timeupdate` event → call `playback.stop()`

The DJ Plyr instance should listen to `ended` and `timeupdate` and proxy them to `playback`.

---

## Expected behavior

| Step | Result |
|---|---|
| Load song | Beamer screen unchanged, no spinner (YouTube, no canplaythrough) |
| Preview | Preview screen on beamer (cover + artist/title) |
| Play → countdown done | DJ Plyr YouTube starts WITH sound; beamer YT.Player starts MUTED |
| Time provider | Plyr `currentTime` registered at countdown-done |
| Audio/video sync | Beamer seeks to `currentTime + videoGap` if drift > 0.5s |
| Drift guard | Beamer skips seek when `currentTime === 0` (provider not started) |
| Pause | DJ Plyr pauses, beamer `ytPlayer.pauseVideo()` |
| Resume | DJ Plyr resumes (`currentTime > 0` guard prevents early restart), beamer `ytPlayer.playVideo()` |
| Song ends (natural) | Plyr `ended` event → `playback.stop()` |
| Song ends (#END) | Plyr `timeupdate` checks `currentTime >= end/1000` → `playback.stop()` |
| 2 beamers | Both sync to same `currentTime` → < 0.5s difference |

---

## Key differences from Case 3 (MP3 + YouTube)

| Aspect | Case 3 | Case 4 |
|---|---|---|
| Audio source | MP3 (`<audio>`) | DJ Plyr YouTube |
| Time provider | `audioEl.currentTime` | `plyr.currentTime` |
| DJ player sound | Silent (YouTube muted on beamer) | Plyr plays WITH sound |
| `GameAudio` mounted | Yes | No (`audioSrc` is null) |
| Song-end signal | `audio.ended` | Plyr `ended` event |
| `#END` enforcement | `timeupdate` on `<audio>` | `timeupdate` on Plyr |

---

## Known limitations

- Plyr must be fully initialized before `countdown-done` fires — otherwise
  `currentTime` returns 0 and the time provider is inaccurate at start.
- Two separate YouTube streams (DJ + each beamer) — unavoidable.
- YouTube API `ended` event is less reliable than HTML5 `ended` — may not fire
  if playback loops or is interrupted. Fallback: check `playerState === YT.PlayerState.ENDED`.
