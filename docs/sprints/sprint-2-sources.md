# Sprint 2 — Song Sources & Real Library

## Goal
Replace mock song data with real songs loaded from local folders on disk.
Add source management UI as a standalone component so it can be placed anywhere.
Add source filtering in the search bar. Show source name in the song table.

---

## Scope

1. **`SongSourcesPanel` component** — extract the song sources section from `SettingsDialog` into its own `src/components/SongSourcesPanel.svelte`. `SettingsDialog` renders it as before; the component can be reused elsewhere later.

2. **Add / remove local folders** — "Add folder" button opens a native Tauri folder picker (`dialog.open`). The selected path is saved as a new `SongSource` with `type: 'local-folder'`. Sources persist in `localStorage` (already wired in `settings.svelte.ts`).

3. **Scan & index songs** — when sources change, scan each enabled `local-folder` for `.txt` files, parse them with the UltraStar parser, and store the results in `songs.svelte.ts` (IndexedDB or reactive in-memory store). A loading/scanning indicator is shown while scanning.

4. **Source filter in SearchBar** — when more than one source exists, show a "Source" `<Select>` filter alongside Language / Genre. Filtering by source narrows the table to songs from that folder.

5. **Source column in SongTable** — add a `Source` column (hidden by default, toggleable via Layout popover). Shows the `label` of the `SongSource` the song came from.

---

## Definition of Done

- [ ] `SongSourcesPanel.svelte` component exists; `SettingsDialog` uses it
- [ ] "Add folder" button opens native folder picker via `src/lib/ipc/tauri.ts`
- [ ] Selected folder is saved as a `SongSource` with a derived label (folder name)
- [ ] Sources persist across restarts (localStorage)
- [ ] Enabled sources are scanned on app load and when a source is added/toggled
- [ ] Scanned songs appear in the song table (replaces mock data)
- [ ] Scanning progress/error state visible somewhere (e.g. status label in sidebar or table)
- [ ] Source filter `<Select>` appears in SearchBar when ≥ 2 sources exist
- [ ] Source column added to SongTable (hidden by default)
- [ ] Removing a source removes its songs from the table
- [ ] Toggling a source enabled/disabled includes/excludes its songs from the table

---

## Files to create / modify

| File | Action |
|---|---|
| `src/components/SongSourcesPanel.svelte` | create — extracted from SettingsDialog |
| `src/components/dialogs/SettingsDialog.svelte` | update — use SongSourcesPanel |
| `src/lib/ipc/tauri.ts` | update — add `pickFolder()` using `@tauri-apps/plugin-dialog` |
| `src/lib/stores/songs.svelte.ts` | create — reactive song list, scan logic |
| `src/lib/ultrastar/parser.ts` | create/verify — parses UltraStar `.txt` format |
| `src/components/views/SearchBar.svelte` | update — add Source filter |
| `src/components/views/SongTable.svelte` | update — add Source column |
| `src/components/views/LibraryPanel.svelte` | update — pass source options to SearchBar |

---

## Notes

- `local-folder` scanning stays in TypeScript (Tauri `fs` plugin reads file list + content). No Rust business logic.
- `usdb` and `custom` source types are out of scope for this sprint — the UI already has the type field, just don't add picker logic for them yet.
- If the UltraStar parser (`src/lib/ultrastar/parser.ts`) already exists from Sprint 1 scaffolding, verify it handles the `#TITLE`, `#ARTIST`, `#YEAR`, `#LANGUAGE`, `#GENRE`, `#BPM`, `#MP3`, `#COVER` header tags at minimum.
