# USDB Integration — Specification

## What is USDB?

USDB (usdb.animux.de) is the largest community database of UltraStar karaoke songs.  
It has ~27,000 songs. Each song has metadata (title, artist, genre, year, etc.) and a `.txt` file with notes + YouTube link for playback.

---

## Goals

1. **Connect** to USDB with username/password
2. **Sync catalog** — download ~27,000 song entries into our library
3. **Show USDB songs** in the library area (alongside local songs, with a green USDB badge)
4. **Load a USDB song** into the player — fetch the `.txt` on demand, parse notes, play via YouTube

---

## Architecture

### Storage
- **Catalog**: `~15MB` — too large for `localStorage` (5MB limit). Must use **IndexedDB** (browser, unlimited) or **Tauri store plugin** (writes to disk file).  
- **Credentials**: `localStorage` (small, just username/password).  
- **Watermark** (lastMtime + lastSongIds): `localStorage` (small numbers).
- **Session**: In-memory only. Rust `UsdbClient` holds the session cookie. On app restart, we must re-login (HTTP POST to USDB).

### Data flow

```
App start
  → SongSourcesPanel mounts
  → If credentials saved: autoLogin() → if ok: syncCatalog(incremental)
  → setUsdbSongs(catalog) → songs appear in library

User clicks "Connect"
  → usdbStore.login()
  → if ok: syncCatalog(full) → setUsdbSongs()

User selects USDB song → "Load into player"
  → usdbGetSongTxt(songId) [Tauri → Rust → HTTP]
  → parseSongNotes(txt)
  → song.youtubeId extracted from #YOUTUBE or #VIDEO tag
  → playback.load(song) → YouTube playback
```

---

## Current Status (2026-07-12)

### ✅ Done
- Rust: `UsdbClient` with `login`, `fetch_all_songs`, `fetch_updated_songs`, `get_song_txt`
- Tauri commands: `usdb_login`, `usdb_fetch_catalog`, `usdb_get_song_txt`
- TypeScript IPC: `usdbLogin`, `usdbFetchCatalog`, `usdbGetSongTxt`
- USDB store: credentials, catalog (in-memory), login, sync, abort
- Sources panel: login form, sync buttons, progress bar, show/hide password
- Prevent close during sync, abort button
- Song library: `setUsdbSongs()` merges USDB songs into library
- Song table: green USDB badge in source column
- Auto-login on panel mount if credentials saved

### ❌ Open Issues

#### 1. Catalog not persisted (CRITICAL)
- `localStorage` silently fails for ~15MB catalog
- On every app restart: catalog is empty → forces full re-sync every time
- **Fix**: Switch to IndexedDB using `idb-keyval` package (or Tauri store plugin)
- Songs should survive app restart without re-syncing

#### 2. Progress bar doesn't show progress (UX)
- Rust fetches ALL pages and returns everything at once
- No intermediate progress events
- **Fix option A**: Emit Tauri events from Rust during pagination (`window.emit('usdb:progress', {fetched, total})`)
- **Fix option B**: Accept indeterminate progress bar for now

#### 3. Song catalog not appearing after sync (BUG — investigate)
- `syncUsdbToLibrary()` called after `syncCatalog()` completes
- `setUsdbSongs(catalog)` called with correct entries
- But songs don't appear in library view
- **Debug**: check if `state.songs` reactivity works correctly with 27k entries

#### 4. Load USDB song into player (NOT IMPLEMENTED)
- Clicking "Load" on a USDB song must fetch the `.txt` file
- Parse notes + extract YouTube ID
- Create a `Song` object and load into `playback`
- Handle error: song deleted from USDB (HTTP 404)

---

## Priority Order

1. **Fix catalog persistence** (IndexedDB) — without this, full resync every launch
2. **Fix songs not appearing** after sync — the whole feature is broken without this
3. **Load USDB song into player** — the actual playback feature
4. **Real progress bar** — nice to have

---

## Implementation Notes

### IndexedDB for catalog
```ts
import { set, get } from 'idb-keyval'

async function saveCatalog(entries: UsdbCatalogEntry[]) {
  await set('usdb_catalog', entries)
}
async function loadCatalog(): Promise<UsdbCatalogEntry[]> {
  return (await get('usdb_catalog')) ?? []
}
```
Simple drop-in replacement. No size limits. No silent failures.

### Loading a USDB song
```ts
async function loadUsdbSong(song: Song) {
  if (!song.usdbId) return
  const txt = await usdbGetSongTxt(song.usdbId)  // may throw if deleted
  const notes = parseSongNotes(txt)
  const youtubeId = extractYouTubeId(txt)
  const fullSong: Song = { ...song, notes, youtubeId }
  await playback.load(fullSong)
}
```

### YouTube ID extraction from .txt
```
#YOUTUBE:dQw4w9WgXcQ     ← direct ID
#VIDEO:https://youtube.com/watch?v=dQw4w9WgXcQ  ← URL
```
Parser already has this partially in `usdb.rs::extract_youtube_id_from_txt`.

### Tauri progress events (for real progress bar)
```rust
// In Rust fetch_all_songs:
app_handle.emit("usdb:progress", ProgressPayload { fetched, total: 27000 }).ok();

// In TypeScript:
const unlisten = await listen('usdb:progress', e => { _syncFetched = e.payload.fetched })
```

---

## UI Specification

### Sources panel — USDB section (bottom, below local folders)
```
[USDB]  usdb.animux.de                    [syncing…]

NOT CONNECTED:
  Username: [___________]
  Password: [___________] [👁]
  [Connect]
  Error message (if wrong credentials)

CONNECTED, idle:
  27,432 songs
  [Sync new]  [Full resync]  [Disconnect]

CONNECTED, syncing:
  [████████████░░░░░░░░░░░] 14,231 / ~27,000
  Syncing catalog…
  [Abort]
```

### Library area — USDB songs
- Same table as local songs
- Source column: green **USDB** badge
- Clicking "Load" → fetches `.txt` → loads into player with YouTube playback

### Error handling
- Wrong password → show error below form
- Song deleted on USDB → toast "Song no longer available on USDB", remove from catalog
- Network error during sync → show error, allow retry
