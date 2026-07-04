# Beamer Media Test Cases

Test each case in order. Verify all checkboxes before moving to the next.

---

## Case 1 — MP3 + Background Image

**Song folder setup:**
```
#TITLE:Test-MP3-Background
#ARTIST:Test
#MP3:song.mp3
#BACKGROUND:bg.jpg
#BPM:120
#GAP:0
```

**Expected behavior:**
- [x] Loading song does NOT change beamer screen
- [x] Hitting Preview shows preview screen on beamer (cover + artist/title)
- [x] Play button is enabled immediately (no spinner — image is instant)
- [x] After countdown: background image fills beamer, lyrics overlay on top
- [x] Pause: audio pauses, image stays (nothing to pause)
- [x] Resume: audio resumes
- [x] Song ends: playback stops automatically (natural end)
- [x] Song ends at #END: playback stops at specified time if #END tag present
- [x] Time counter in DJ modal advances correctly

**Known issues / notes:**
_none_

---

## Case 2 — MP3 + MP4 Video

**Song folder setup:**
```
#TITLE:Test-MP3-MP4
#ARTIST:Test
#MP3:song.mp3
#VIDEO:video.mp4
#BPM:120
#GAP:0
```

**Expected behavior:**
- [x] Loading song does NOT change beamer screen
- [x] Hitting Preview: spinner on play button while video buffers
- [x] Spinner disappears when video is ready (canplaythrough)
- [x] After countdown: video plays fullscreen muted, lyrics overlay on top
- [x] Video is in sync with audio (< 0.5s drift)
- [~] Both beamers show video at same position (< 0.1s difference) — ~90ms IPC latency, acceptable
- [x] Pause: audio AND video both pause simultaneously
- [x] Resume: audio AND video both resume from same position
- [x] Song ends: playback stops automatically, beamer shows score screen, DJ shows Clear button
- [x] Song ends at #END: playback stops at specified time if #END tag present
- [x] DJ player plays from MP3 (not MP4) — confirm in console: `audio source: audio`

**Known issues / notes:**
- ~90ms beamer-to-beamer offset is IPC latency (two separate WebView processes) — not fixable without complex sync protocol
- `#VIDEOGAP` support needed for precise audio/video alignment per song (planned for pitch detection sprint)

---

## Case 3 — MP3 + YouTube (background video)

**Song folder setup:**
```
#TITLE:Test-MP3-YouTube
#ARTIST:Test
#MP3:song.mp3
#VIDEO:https://www.youtube.com/watch?v=VIDEO_ID
#BPM:120
#GAP:0
```

**Expected behavior:**
- [x] Loading song does NOT change beamer screen
- [x] Hitting Preview: no spinner (YouTube can't reliably signal canplaythrough)
- [x] After countdown: YouTube video plays muted as background, lyrics overlay
- [x] YouTube video roughly in sync with MP3 audio
- [x] DJ player plays from MP3 (not YouTube)
- [x] Pause: audio pauses, YouTube video pauses
- [x] Resume: audio resumes from correct position, YouTube video resumes
- [x] Song ends: playback stops automatically, beamer shows score screen, DJ shows Clear button
- [x] Song ends at #END: playback stops at specified time if #END tag present

**Known issues / notes:**
- Two separate YouTube streams (one per beamer) — sync via seekTo(currentTime + videoGap) each tick
- `#VIDEOGAP` supported: video seeks to videoGap seconds at start and stays in sync

---

## Case 4 — YouTube Only (no MP3)

**Song folder setup:**
```
#TITLE:Test-YouTube-Only
#ARTIST:Test
#VIDEO:https://www.youtube.com/watch?v=VIDEO_ID
#BPM:120
#GAP:0
```

**Expected behavior:**
- [x] DJ player plays YouTube WITH sound (via Plyr YouTube)
- [x] Beamer shows YouTube video MUTED as background
- [x] Both DJ and beamer YouTube videos start at countdown-done
- [x] Time counter in DJ modal advances from YouTube Plyr currentTime
- [x] Lyrics advance in sync with music (negative beat values supported)
- [x] Pause: DJ YouTube pauses, beamer YouTube pauses
- [x] Resume: both resume
- [ ] Song ends: playback stops automatically (natural end via Plyr ended event)
- [ ] Song ends at #END: playback stops at specified time
- [ ] `#VIDEOGAP` supported: beamer YouTube starts at offset seconds

---

## Case 5 — MP3 + Cover Only (no background, no video)

**Song folder setup:**
```
#TITLE:Test-MP3-Cover
#ARTIST:Test
#MP3:song.mp3
#COVER:cover.jpg
#BPM:120
#GAP:0
```

**Expected behavior:**
- [ ] Loading song does NOT change beamer screen
- [ ] Hitting Preview shows preview screen on beamer (cover + artist/title)
- [ ] Play button is enabled immediately (no spinner — image is instant)
- [ ] After countdown: blurred cover fills beamer background, lyrics overlay on top
- [ ] Pause: audio pauses, image stays
- [ ] Resume: audio resumes
- [ ] Time counter in DJ modal advances correctly

**Known issues / notes:**
_none so far_

---

## Case 6 — MP4 Only (no MP3)

**Song folder setup:**
```
#TITLE:Test-MP4-Only
#ARTIST:Test
#VIDEO:video.mp4
#BPM:120
#GAP:0
```

**Expected behavior:**
- [ ] Loading song does NOT change beamer screen
- [ ] Hitting Preview: spinner on play button while video buffers
- [ ] Spinner disappears when video is ready (canplaythrough)
- [ ] After countdown: video plays fullscreen muted on beamer, lyrics overlay
- [ ] DJ audio plays from the MP4 file (browser extracts audio track)
- [ ] Video is in sync with audio (< 0.5s drift)
- [ ] Pause: audio AND video both pause
- [ ] Resume: both resume from same position

**Known issues / notes:**
_none so far_

---

## Issue Log

| # | Case | Issue | Status |
|---|------|-------|--------|
| 1 | All | Loading song auto-opens preview on beamers | 🔴 open |
| 2 | All | Spinner stays when song has no MP3 | 🔴 open |
| 3 | MP4 | Video continues playing during pause | 🔴 open |
| 4 | MP4 | Beamers show video at different time positions | 🔴 open |
