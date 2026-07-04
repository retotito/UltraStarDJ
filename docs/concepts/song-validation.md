# Song Validation — Concept

## Goal
Validate a song before it is used (loaded, previewed, queued).
Show a clear error modal with the exact problem if validation fails.
Never block the song list scan — validation is lazy (on demand only).

---

## When validation runs

| Trigger | Validation |
|---|---|
| "Load" button (PlayerWidget) | Full validation |
| "Add to Queue" | Full validation |
| (Optional later) Song list scan | Light validation only (no file-exist checks — keeps scan fast) |

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

## Checks per song type

### TXT format checks (all songs — fast, no I/O)

These run first, before any file-existence checks. Based on allkaraoke's `validate-ultrastar.ts` and the official UltraStar format spec.

| Check | Field | Error message |
|---|---|---|
| `#TITLE` tag present in txt | `title` | "Missing required tag: #TITLE" |
| `#ARTIST` tag present in txt | `artist` | "Missing required tag: #ARTIST" |
| `#BPM` tag present and > 0 | `bpm` | "Missing or invalid #BPM — notes cannot be timed" |
| At least one note line (`:`) exists | `notes` | "Song has no singable notes" |
| All note values parse to finite numbers | `notes` | "Song has malformed note data (NaN or Infinity)" |

> Source: [allkaraoke/validate-ultrastar.ts](https://github.com/Asvarox/allkaraoke/blob/master/src/modules/songs/utils/validate-ultrastar.ts)

---

### Local songs (source: `local-folder`)

| Check | Field | Error message |
|---|---|---|
| Has at least one audio source | `audioPath` or `youtubeId` | "No audio source — song has no MP3 and no YouTube link" |
| `audioPath` file exists on disk | `audioPath` | "Audio file not found: {path}" |
| `videoPath` file exists (if set, local path only) | `videoPath` | "Video file not found: {path}" |
| `backgroundPath` file exists (if set) | `backgroundPath` | "Background image not found: {path}" |
| `coverPath` file exists (if set) | `coverPath` | "Cover image not found: {path}" |
| `txtPath` file exists | `txtPath` | "Song file (.txt) not found: {path}" |

YouTube video paths (start with `http`) are NOT checked for file existence.

### Remote/streamed songs (USDB, Animux, future sources)

| Check | Field | Error message |
|---|---|---|
| Has `youtubeId` or stream URL | `youtubeId` | "No stream source defined" |
| Network is online | — | "No internet connection — cannot stream this song" |

No file-exist checks for remote songs (no local files to check).

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
