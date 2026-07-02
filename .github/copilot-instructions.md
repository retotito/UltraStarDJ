# UltrastarDJ — AI Agent Instructions

You are working on **UltrastarDJ**, a desktop karaoke DJ app built with Tauri 2 + Svelte 5 + TypeScript.

## Mandatory: Read before writing any code

Before adding or editing any UI, read `src/app.css` to understand available tokens and utility classes.
Before adding state, check `src/lib/stores/` for existing stores.
Before adding a new component, check `src/components/ui/` for existing reusables.

---

## Tech Stack

- **Frontend**: Svelte 5 (runes: `$state`, `$derived`, `$props`, `$effect`) — no Svelte 4 stores
- **Framework**: SvelteKit with `adapter-static` (no SSR, no server — pure client-side SPA)
- **Desktop**: Tauri 2 (Rust backend for file I/O and window management only)
- **UI components**: `@material/web` for form elements (buttons, inputs, sliders, switches)
- **Language**: TypeScript everywhere — no plain `.js` files in `src/`

## Architectural Rules

### 1. No business logic in Rust
The Rust backend (`src-tauri/src/`) only:
- Opens native file/folder dialogs
- Scans directories and reads `.txt` files
- Opens the beamer window
- Serves local asset files

### 2. Two windows, one codebase
- `main` window loads route `/` → DJ interface
- `beamer` window loads route `/beamer` → singer screen
- All Tauri IPC calls are in `src/lib/ipc/tauri.ts` — never import `@tauri-apps` directly in components

### 3. Design system — always use tokens
- **Never** use hardcoded hex colors, pixel values, or inline `style=""` attributes
- All colors: `var(--md-sys-color-*)` tokens defined in `src/app.css`
- All spacing: `var(--space-*)` tokens
- All typography: `var(--text-*)` and `var(--font-*)` tokens
- For `@material/web` components, override via `--md-*` CSS custom properties only

### 4. Svelte 5 runes only
```svelte
<!-- ✅ Correct -->
<script lang="ts">
  let count = $state(0)
  let doubled = $derived(count * 2)
  let { title }: { title: string } = $props()
</script>

<!-- ❌ Wrong — no Svelte 4 stores -->
<script lang="ts">
  import { writable } from 'svelte/store'
  export let title: string
</script>
```

### 5. Store files use `.svelte.ts` extension
Reactive store files must use the `.svelte.ts` extension so Svelte 5 runes work outside components.

### 6. Path aliases
- `$lib/` → `src/lib/`
- `$components/` → `src/components/`

---

## Folder Structure

```
src/
  app.css                  ← ALL design tokens and utility classes — read this first
  lib/
    stores/                ← Svelte 5 rune-based stores (.svelte.ts)
      dialog.svelte.ts     ← modal/dialog state
      player.svelte.ts     ← playback state
      queue.svelte.ts      ← song queue
      settings.svelte.ts   ← app settings & song sources
    ultrastar/
      types.ts             ← Song, Note, NoteTrack interfaces
      parser.ts            ← UltraStar .txt file parser (Sprint 1)
    db/
      songs.ts             ← IndexedDB song library cache (Sprint 1)
    ipc/
      tauri.ts             ← ALL Tauri API calls (window, events, filesystem)
  components/
    ui/                    ← Reusable primitives (Icon, Modal, Table, Chip…)
    dialogs/               ← Modal content (SettingsDialog, SongDetailDialog…)
    views/                 ← DJ window views (LibraryView, QueueView…)
    game/                  ← Beamer/singer components (BeamerView, LyricsCanvas…)
  routes/
    +layout.svelte         ← imports app.css
    +layout.ts             ← ssr = false
    +page.svelte           ← DJ window root
    beamer/
      +page.svelte         ← Beamer window root
```

---

## IPC Event Contract (DJ → Beamer)

| Event | Payload | Direction |
|---|---|---|
| `ultrastar:play-song` | `PlaySongPayload` | DJ → Beamer |
| `ultrastar:stop-song` | `null` | DJ → Beamer |
| `ultrastar:pause-song` | `null` | DJ → Beamer |
| `ultrastar:resume-song` | `null` | DJ → Beamer |

Always use the constants from `src/lib/ipc/tauri.ts` — never hardcode event name strings.

---

## Song Sources

Song sources are defined in settings (`SongSource` interface in `settings.svelte.ts`).
Each source has a `type`: `local-folder` | `usdb` | `custom`.
Sprint 1 implements `local-folder` only. The interface is designed for extension.

---

## What NOT to do

- Do not create new CSS variables — add to `src/app.css` if genuinely new
- Do not use `import { writable } from 'svelte/store'`
- Do not import from `@tauri-apps/*` directly in components — use `src/lib/ipc/tauri.ts`
- Do not add backend server logic — this is a static SPA + Tauri
- Do not use `SvelteKit` server routes (`+server.ts`, `+page.server.ts`)
- Do not add `export const prerender` — handled globally via adapter-static fallback
