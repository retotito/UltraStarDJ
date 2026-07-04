# Song Validation — Concept

## Goal
Validate a song before it is used (loaded, previewed, queued).
Show a clear error modal with the exact problem if validation fails.
Never block the song list scan — validation is lazy (on demand only).

---

## When validation runs

| Trigger | Validation |
|---|---|
| Double-click song row | Full validation |
| Right-click → Preview | Full validation |
| Right-click → Add to Queue | Full validation |
| Right-click → Load into player | Full validation |
| Load button (PlayerWidget) | Full validation |
| Add to Queue button (PlayerWidget) | Full validation |
| Load from Queue (QueueWidget) | Full validation |
| Song list scan | None — validation is lazy (on demand only) |

No distinction between preview and load/queue — if a song can't play, don't load it at all.

---

## Validator: `validate_song.ts`

One file handles all song types. Returns a structured result:

```ts
interface SongValidationResult {
  valid: boolean
  errors: SongValidationError[]
}

interface SongValidationError {
  field: string        // e.g. 'videoPath', 'audioPath'
  message: string      // human-readable
  path?: string        // the file path that failed (if applicable)
}
```

---

## Checks

### TXT format checks (fast, no I/O — from parsed Song fields)

| Check | Blocks? | Reason |
|---|---|---|
| `#TITLE` present | ✓ | Can't identify song |
| `#ARTIST` present | ✓ | Can't identify song |
| `#BPM` present and > 0 | ✓ | Notes can't be timed without it |
| At least one note line (`:`) in txt | ✓ | No lyrics = not singable |

### File existence checks (async, Tauri `pathExists()`)

| Check | Blocks? | Reason |
|---|---|---|
| At least one audio source exists (`audioPath` file on disk, or `videoPath` file on disk, or `youtubeId`) | ✓ | Nothing to play |
| `audioPath` set but file missing, AND no `videoPath`/`youtubeId` fallback | ✓ | Audio broken, no fallback |
| `videoPath` set, file missing, AND it is the sole audio source (no `audioPath`, no `youtubeId`) | ✓ | Only audio source is gone |
| `videoPath` missing when `audioPath` also present | ✗ | Falls back to audio-only gracefully |
| `backgroundPath` missing | ✗ | Cosmetic — song still plays |
| `coverPath` missing | ✗ | Cosmetic — song still plays |
| `txtPath` missing | ✗ | Can't happen — song wouldn't appear in library |

### Notes on `#VIDEOGAP`
`#VIDEOGAP` is already parsed and passed to `LyricsRenderer` and `BeamerView` — video sync works automatically. No extra validation needed.

### Remote paths
Paths starting with `http://` or `https://` skip all file-existence checks.

---

## Song patching

`validateSong()` returns a **patched copy** of the song alongside the result.
The patch nulls out any fields that point to missing files — so the loader's
fallback chain kicks in automatically without extra logic.

```ts
interface SongValidationResult {
  valid: boolean
  errors: SongValidationError[]
  song: Song   // patched copy — safe to pass directly to playback.load()
}
```

**Example:** `audioPath` is set but the file is missing on disk, `videoPath` exists:
```
Original: { audioPath: "/songs/foo.mp3", videoPath: "/songs/foo.mp4" }
Patched:  { audioPath: undefined,        videoPath: "/songs/foo.mp4" }
```
`GameAudio` skips `audioPath` (undefined), falls back to `videoPath` automatically.

Callers always use `result.song` (not the original) when proceeding:
```ts
const result = await validateSong(song)
if (!result.valid) { errorStore.show(...); return }
playback.load(result.song)   // ← patched copy
```

---

## File existence check

Use Tauri's `exists()` from `@tauri-apps/plugin-fs`:

```ts
import { exists } from '@tauri-apps/plugin-fs'
await exists(absolutePath)  // returns boolean
```

This is the correct approach — browser APIs cannot access local file paths directly.

---

## UI: Validation error modal

- Triggered automatically when `validate_song()` returns `valid: false`
- Lists each error clearly (field label + message + path)
- Single "OK" button to dismiss
- Does NOT proceed with load/queue/preview

```
┌─────────────────────────────────────┐
│ ⚠ Song cannot be loaded             │
│                                     │
│ Video file not found:               │
│ /Music/Songs/MySong/video.mp4       │
│                                     │
│ Audio file not found:               │
│ /Music/Songs/MySong/song.mp3        │
│                                     │
│                    [ OK ]           │
└─────────────────────────────────────┘
```

---

## Files to create / modify

| File | Action |
|---|---|
| `src/lib/ultrastar/validate_song.ts` | New — validation logic |
| `src/components/dialogs/SongValidationDialog.svelte` | New — error modal |
| `src/lib/stores/dialog.svelte.ts` | Update — add `song-validation` dialog type |
| `src/components/views/PlayerWidget.svelte` | Update — call validate before `playback.load()` |
| `src/lib/stores/queue.svelte.ts` | Update — call validate before `songQueue.add()` |

---

## Notes

- Validation is async (file-exist checks need Tauri IPC)
- One `validate_song.ts` covers all source types (local + remote)
- Keep validation fast: only check what's needed for the triggered action
- Error reporting system (app-wide) is a separate future concern — this modal is self-contained
