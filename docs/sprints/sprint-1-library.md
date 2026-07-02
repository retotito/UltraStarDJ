# Sprint 1 — DJ Window Layout & Song Library

## Goal
Build the full DJ window layout with real components and dummy data.
No Tauri file I/O yet — focus on the UI structure, interactions and component split.
Song data comes from a hardcoded mock array so every component can be built and tested independently.

---

## Layout Wireframe

```
┌────┬──────────────────────────────────────────┬─drag─┬──────────────────────┐
│    │  [🔍 Search...]  [Lang ▾] [Genre ▾]  [+] │      │  ╔═ PLAYER ═════════╗ │
│ 🎵 │  ──────────────────────────────────────  │      │  ║ [cover]          ║ │
│    │  Title      │ Artist   │ Year │ Lang │ … │      │  ║ Title / Artist   ║ │
│ ☰  │  ───────────┼──────────┼──────┼──────┼── │      │  ║ [▶ Preview]      ║ │
│    │  Song A     │ Artist A │ 2020 │  EN  │ … │      │  ╚══════════════════╝ │
│    │  Song B     │ Artist B │ 2018 │  DE  │ … │      │  ╔═ QUEUE ══════════╗ │
│ ⚙  │  Song C     │ Artist C │ 2022 │  EN  │ … │      │  ║ 1. Song A  ↑↓ ✕ ║  │
│    │  (scrollable, sortable)                  │      │  ║ 2. Song B  ↑↓ ✕ ║  │
│ ▶  │                                          │      │  ║ [▶ Start next]   ║  │
│    │                                          │      │  ╚══════════════════╝  │
└────┴──────────────────────────────────────────┴──────┴──────────────────────┘
56px        flex: 1 (fills remaining width)    drag    ~400px default, resizable
```

### Row hover — `...` menu (like Gmail)
```
  Song A  │ Artist A │ 2020 │ EN │ ···  ← button appears on row hover
                                   ↓ popover
                             ┌───────────────┐
                             │ ▶ Preview     │
                             │ + Add to queue│
                             │ ℹ  Details   │
                             └───────────────┘
```
Also triggered by right-click on the row.

---

## Component Tree

```
AppShell.svelte                  ← root layout (sidebar + library + right panel)
├── Sidebar.svelte               ← 56px icon nav, vertically scrollable, opens modals
│   └── [icon buttons with md-tooltip]
├── LibraryPanel.svelte          ← flex:1 center column
│   ├── SearchBar.svelte         ← search input + filter chips
│   └── SongTable.svelte         ← table, sortable columns, configurable visibility
│       └── SongRowMenu.svelte   ← ... hover menu + right-click context menu
└── RightPanel.svelte            ← resizable via drag divider (~400px default)
    ├── [drag handle between widgets]
    ├── PlayerWidget.svelte      ← preview player for selected song
    └── QueueWidget.svelte       ← queue list, move up/down, start next
```

All components live in `src/components/`. Each component has its own `<style>` block.
No component imports another component's styles — only tokens from `app.css`.

---

## Sidebar Icons (left to right, top to bottom)

| Icon | Action |
|---|---|
| 🎵 Music note | (active indicator — Library is always the main view) |
| ☰  Layout | Popover: toggle Player widget / Queue widget visibility |
| ⚙  Settings | Opens `SettingsDialog` modal (song sources, theme, volume) |
| ▶  Beamer | Opens the beamer window (calls `openBeamerWindow()`) |

Icons use Material Symbols (via `@material/web` or a simple icon font).
Each opens a modal or popover **next to the icon** (not a route change).

---

## SongTable Columns

Default visible columns:

| Column | Default | Sortable | Notes |
|---|---|---|---|
| # | visible | — | row number |
| Title | visible | ✓ | |
| Artist | visible | ✓ | |
| Year | visible | ✓ | |
| Language | visible | ✓ | |
| BPM | hidden | ✓ | toggle via Layout popover |
| Genre | hidden | ✓ | toggle via Layout popover |
| Duration | hidden | ✓ | toggle via Layout popover |
| `...` actions | visible | — | always last column |

Column visibility and sort state stored in `settings.svelte.ts`.

---

## RightPanel Widgets

- Default order: Player (top) → Queue (bottom)
- Drag handle between them to resize the split
- Each widget can be hidden via the Layout icon in sidebar
- Widget order is drag-and-drop switchable (Player ↔ Queue)

---

## Mock Data

For Sprint 1, song data comes from `src/lib/db/mockSongs.ts` — a hardcoded array of 20 songs covering a range of languages, years and genres. No Tauri file I/O in this sprint.

---

## Definition of Done

- [ ] `AppShell` renders the three-column layout with correct sizing
- [ ] Drag divider between LibraryPanel and RightPanel works (min 200px, max 700px)
- [ ] `Sidebar` shows icons with tooltips, scrolls if more icons than height
- [ ] Settings icon opens `SettingsDialog` modal
- [ ] Beamer icon calls `openBeamerWindow()`
- [ ] `SongTable` renders mock songs, all visible columns shown
- [ ] Table is sortable by clicking column headers
- [ ] `SearchBar` filters the table in real time (title + artist)
- [ ] Filter chips for Language and Genre
- [ ] Row hover shows `...` button; click opens `SongRowMenu` popover
- [ ] Right-click on row also opens `SongRowMenu`
- [ ] "Add to queue" in row menu adds song to `songQueue` store
- [ ] `PlayerWidget` shows selected song metadata (no audio yet)
- [ ] `QueueWidget` shows queue, supports move-up/down and remove
- [ ] RightPanel widgets are vertically resizable via drag handle
- [ ] Layout icon in sidebar toggles Player / Queue widget visibility
- [ ] All styling via `app.css` tokens — no hardcoded colors or px values

---

## Files to create / modify

| File | Action |
|---|---|
| `src/lib/db/mockSongs.ts` | create — 20 dummy Song objects |
| `src/components/AppShell.svelte` | create — root layout |
| `src/components/Sidebar.svelte` | create — icon nav |
| `src/components/views/LibraryPanel.svelte` | create — center column |
| `src/components/views/SearchBar.svelte` | create — search + filters |
| `src/components/views/SongTable.svelte` | create — sortable table |
| `src/components/views/SongRowMenu.svelte` | create — hover/right-click menu |
| `src/components/views/RightPanel.svelte` | create — resizable panel |
| `src/components/views/PlayerWidget.svelte` | create — selected song display |
| `src/components/views/QueueWidget.svelte` | create — queue list |
| `src/components/dialogs/SettingsDialog.svelte` | create — settings modal |
| `src/components/ui/Modal.svelte` | create — reusable modal wrapper |
| `src/components/ui/Tooltip.svelte` | create — icon tooltip |
| `src/components/ui/Popover.svelte` | create — anchored popover |
| `src/routes/+page.svelte` | update — render AppShell |
| `src/lib/stores/settings.svelte.ts` | update — add column visibility state |
