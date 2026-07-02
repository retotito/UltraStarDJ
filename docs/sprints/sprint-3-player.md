# Sprint 3 — PlayerWidget: Plyr-based Preview Player

## Goal
Bring the `PlayerWidget` in the right panel to life.
When a song is selected in the library, the player shows the available media and lets the DJ preview it with full playback controls — no autoplay, click to start.

Uses **Plyr** as the unified player for all media types.

---

## Media Fallback Chain

For a selected song, the player resolves media in this order:

```
1. Local MP4              → Plyr video player (16:9)
2. YouTube + online       → Plyr YouTube embed (16:9)
3. YouTube + offline      → cover (cropped 16:9) or placeholder + "offline" badge
4. MP3 + cover            → Plyr audio controls + cover image (cropped 16:9, object-fit: cover)
5. MP3 only               → Plyr audio controls + placeholder image (16:9 SVG)
6. Nothing                → placeholder image (16:9 SVG)
```

All media slots are 16:9. Cover art (square) is displayed with `object-fit: cover` — centered crop to fill the frame, no letterboxing. This matches how Spotify/Apple Music handle square art in non-square containers.

Placeholder is a generated SVG (`src/assets/song-placeholder.svg`) — music note on a subtle gradient. No external image needed.

### Offline detection
A small reactive `network.svelte.ts` store tracks `navigator.onLine` and listens to `window online`/`offline` events. The player checks `network.isOnline` before attempting a YouTube embed.

---

## What needs to change

### 1. Parser — detect YouTube URLs in `#VIDEO`
Currently the parser always treats `#VIDEO` as a local file path.
Add detection: if the value looks like a YouTube URL or bare video ID, set a new `youtubeId` field instead of `videoPath`.

Detection rules:
- `https://www.youtube.com/watch?v=XXXXXXXXXXX` → extract `v=` param
- `https://youtu.be/XXXXXXXXXXX` → extract last path segment
- Bare 11-char alphanumeric string → use as-is

### 2. Song type — add `youtubeId`
Add `youtubeId?: string` to the `Song` interface in `types.ts`.

### 3. Plyr integration
- Install `plyr` and `@types/plyr` (if available)
- Theme Plyr's CSS variables to match MD3 dark/light tokens
- Mount Plyr on a `<video>`, `<audio>`, or YouTube target depending on resolved media type
- Destroy and recreate the instance when the selected song changes

### 4. PlayerWidget redesign
Replace the current placeholder UI with:

```
┌─────────────────────────────────┐
│  [Plyr player — video / cover]  │  ← 16:9 aspect, fills widget width
│  ─────────────────────────────  │
│  Title                          │
│  Artist                    year │
│  [+ Add to Queue]  [▶ Preview]  │  ← Preview = play in player here
└─────────────────────────────────┘
```

- If no song selected: full placeholder with icon
- Cover image as `object-fit: cover` behind the Plyr audio controls
- Plyr replaces the "Preview" button — the player itself IS the preview

### 5. Tauri asset serving for local files
Local MP4/MP3/cover images need to be served via Tauri's asset protocol so the `<video>`/`<audio>`/`<img>` src can load them.
Use `convertFileSrc` from `@tauri-apps/api/core` to convert absolute paths → `asset://` URLs.
Add a helper `toAssetUrl(path: string): string` to `src/lib/ipc/tauri.ts`.

### 6. CSP — allow YouTube iframe
In `tauri.conf.json`, update the CSP to allow `https://www.youtube.com` and `https://www.youtube-nocookie.com` as frame sources.

### 7. Audio output selection (note — deferred to Sprint 5)
`AudioContext.setSinkId()` will route the preview audio to a separate output device (DJ headphones).
Deferred — design the player to use a dedicated `AudioContext` so this can be wired up later without refactor.

---

## Definition of Done

- [ ] `network.svelte.ts` store — reactive `isOnline` via `navigator.onLine` + window events
- [ ] `song-placeholder.svg` created in `src/assets/`
- [ ] `youtubeId` field added to `Song` interface
- [ ] Parser detects YouTube URLs/IDs in `#VIDEO` tag and sets `youtubeId`
- [ ] `toAssetUrl()` helper in `tauri.ts`
- [ ] Plyr installed and CSS themed to match MD3 dark theme
- [ ] `PlayerWidget` shows Plyr video player when `song.videoPath` is a local MP4
- [ ] `PlayerWidget` shows Plyr YouTube embed when `song.youtubeId` is set
- [ ] `PlayerWidget` shows Plyr audio player + cover image when only `song.audioPath`
- [ ] `PlayerWidget` shows placeholder when no media available
- [ ] No autoplay — user clicks play
- [ ] Player resets / stops when a different song is selected
- [ ] "Add to Queue" button still works
- [ ] CSP allows YouTube frames

---

## Files to create / modify

| File | Action |
|---|---|
| `src/lib/stores/network.svelte.ts` | create — reactive `isOnline` state |
| `src/assets/song-placeholder.svg` | create — 16:9 SVG placeholder |
| `src/lib/ultrastar/types.ts` | add `youtubeId?: string` to `Song` |
| `src/lib/ultrastar/parser.ts` | detect YouTube in `#VIDEO`, set `youtubeId` |
| `src/lib/ipc/tauri.ts` | add `toAssetUrl()` helper |
| `src-tauri/tauri.conf.json` | update CSP for YouTube iframes |
| `src/components/views/PlayerWidget.svelte` | full redesign with Plyr |
| `src/app.css` | Plyr CSS variable overrides for MD3 theme |

---

## Notes

- Plyr must be destroyed on `onDestroy` and when the song changes (`$effect`)
- For YouTube, Plyr handles the iframe internally — just pass `{ type: 'youtube', sources: [{ src: youtubeId }] }`
- `convertFileSrc` is needed because Tauri's webview cannot load `file://` paths directly for security reasons — `asset://` is the correct protocol
- Keep Plyr's default controls visible (don't hide them) — the DJ needs quick scrubbing access
