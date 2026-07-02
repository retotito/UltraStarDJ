# Architecture

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 (Rust) |
| Frontend framework | Svelte 5 (runes) + SvelteKit (static adapter) |
| Build tool | Vite 6 |
| Language | TypeScript (strict) |
| UI components | `@material/web` (MD3 Web Components) |
| Design tokens | CSS custom properties (`src/app.css`) |
| State | Svelte 5 `$state` runes in `.svelte.ts` stores |
| Persistence | Tauri Store plugin (later) / localStorage (now) |
| IPC | Tauri events (`emit` / `listen`) |

## Windows

| Label | Route | Purpose |
|---|---|---|
| `main` | `/` | DJ interface — library, queue, settings |
| `beamer` | `/beamer` | Singer screen — video, lyrics, scores |

The beamer window is opened programmatically from the DJ window via `openBeamerWindow()` in `src/lib/ipc/tauri.ts`.

## Layer Rules

### Rust (src-tauri/)
- File system: open dialogs, scan folders, read `.txt` files
- Window management: open/close/position beamer window
- Asset serving: serve local mp3/mp4/jpg via `asset://` protocol
- **No business logic**

### Svelte Stores (src/lib/stores/)
- Single source of truth for all app state
- Svelte 5 `$state` runes, `.svelte.ts` extension
- No Tauri imports — stores are framework-agnostic

### IPC Layer (src/lib/ipc/tauri.ts)
- Single file that wraps all `@tauri-apps` imports
- Components never import from `@tauri-apps` directly
- Defines all event name constants

### Components (src/components/)
- Pure presentation — read from stores, emit IPC via the ipc module
- All styling via `var(--md-sys-color-*)` and `var(--space-*)` tokens

## Cross-Window Communication

```
DJ Window (main)                    Beamer Window
     │                                   │
     │── emit('ultrastar:play-song') ────▶│
     │── emit('ultrastar:stop-song') ────▶│
     │                                   │
```

The Rust backend relays events between windows automatically.

## Song Source Plugin Interface

```typescript
interface SongSource {
  id: string
  type: 'local-folder' | 'usdb' | 'custom'
  label: string
  path?: string   // local-folder only
  enabled: boolean
}
```

Sprint 1: `local-folder` only. Sources are managed in Settings dialog.

## Design System

All tokens defined in `src/app.css`. Two layers:
1. **MD3 system tokens** (`--md-sys-color-*`) — used by `@material/web` components AND custom surfaces
2. **App-specific tokens** (`--color-table-*`, `--space-*`, `--radius-*`, etc.)

Theme switching: toggle class `light` on `<html>`. Dark is default.
