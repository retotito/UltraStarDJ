# `#VIDEOGAP` — How it works across all 6 cases

## Definition

```
#VIDEOGAP:19.5
```

`#VIDEOGAP` (in **seconds**, supports comma or dot decimal) defines the offset
between the start of the media file and the start of the actual song content.

**The rule:** when the game clock (`currentTime`) is at 0, the video/YouTube
visual should be at `videoGap` seconds into the file.

Equivalently: the video file has a `videoGap`-second intro before the song
content begins. Skipping that intro brings audio and visual into alignment.

---

## The two modes

### Mode A — Separate audio file (Cases 1, 2, 3, 5)

The MP3 is the time authority. It always starts at position 0.
`currentTime` = `audioEl.currentTime` (starts at 0).

The video/YouTube background is offset **forward** by `videoGap`:
```
beamer seek target = currentTime + videoGap
```

At game time 0 (audio at 0s) → beamer video at `videoGap` seconds.
At game time 5s (audio at 5s) → beamer video at `5 + videoGap` seconds.

The MP3 audio and the video file are **different files** — `videoGap` aligns them.

### Mode B — Video IS the audio source (Cases 4, 6)

There is no separate MP3. The video file (or YouTube stream) is both the audio
and visual source. Audio and visual must always show the **same position** in
the file — they cannot be offset relative to each other.

Instead, `videoGap` means: **skip the first `videoGap` seconds** of the file
entirely. Both audio and visual start at `videoGap` seconds into the file.

```
audio seek at start  = videoGap
visual seek at start = videoGap
currentTime          = media.currentTime - videoGap  (starts at 0)
```

The game clock (`currentTime`) still starts at 0. Lyrics and note timings
are unchanged — `#GAP` is still relative to game time 0.

---

## Case-by-case breakdown

### Case 1 — MP3 + Background Image
- No video → `#VIDEOGAP` has no effect.
- Image is static.

### Case 2 — MP3 + MP4 Video
- **Mode A.**
- Audio (MP3) starts at 0. Beamer `<video>` seeks to `currentTime + videoGap`.
- Drift-sync keeps `videoEl.currentTime ≈ audioEl.currentTime + videoGap` every tick.
- `videoGap` compensates for any intro in the video file before the song content.

### Case 3 — MP3 + YouTube background
- **Mode A.**
- Audio (MP3) starts at 0. Beamer YouTube player seeks to `currentTime + videoGap`.
- Same math as Case 2, but via `ytPlayer.seekTo()` instead of `videoEl.currentTime`.

### Case 4 — YouTube Only
- **Mode B.**
- GameYouTube (hidden, DJ window, with sound) seeks to `videoGap` before starting.
- BeamerBackground YouTube (muted, beamer) seeks to `videoGap` via drift-sync.
- Time provider returns `ytPlayer.getCurrentTime() - videoGap` so `currentTime` starts at 0.
- Both the audio stream (DJ) and the visual (beamer) are at the same position in the YouTube video.

### Case 5 — MP3 + Cover Only
- **Mode A.**
- No video → `#VIDEOGAP` has no effect.
- Cover image is static.

### Case 6 — MP4 Only
- **Mode B.**
- GameAudio `<audio>` seeks to `videoGap` before starting.
- BeamerBackground `<video>` seeks to `videoGap` via drift-sync.
- Time provider returns `audioEl.currentTime - videoGap` so `currentTime` starts at 0.
- Both `<audio>` and `<video>` play from the same position in the file — no offset between them.

---

## Summary table

| Case | Audio source | Visual source | Audio start | Visual start | `currentTime` |
|------|-------------|---------------|-------------|--------------|---------------|
| 1 | MP3 | Static image | 0 | N/A | `audioEl.currentTime` |
| 2 | MP3 | Local MP4 | 0 | `T + videoGap` | `audioEl.currentTime` |
| 3 | MP3 | YouTube bg | 0 | `T + videoGap` | `audioEl.currentTime` |
| 4 | YouTube (GameYouTube) | YouTube (beamer) | `videoGap` | `T + videoGap` | `yt.currentTime - videoGap` |
| 5 | MP3 | Cover image | 0 | N/A | `audioEl.currentTime` |
| 6 | MP4 via `<audio>` | Local MP4 | `videoGap` | `T + videoGap` | `audioEl.currentTime - videoGap` |

Where `T` = `currentTime` (game clock, always starts at 0).

---

## Implementation status

| Case | videoGap implemented? | Notes |
|------|-----------------------|-------|
| 1 | N/A | No video |
| 2 | ✅ | Drift-sync with `currentTime + videoGap` target |
| 3 | ✅ | YouTube seekTo with `currentTime + videoGap` target |
| 4 | ⚠️ partial | Beamer seeks correctly, but GameYouTube doesn't seek to `videoGap` at start and time provider doesn't subtract `videoGap` |
| 5 | N/A | No video |
| 6 | ⚠️ partial | Beamer video seeks to `currentTime + videoGap`, but GameAudio `<audio>` starts at 0 and time provider doesn't subtract `videoGap` |

Cases 4 and 6 need:
1. Audio element / YT player to seek to `videoGap` before starting
2. Time provider to return `position - videoGap` so game clock starts at 0
