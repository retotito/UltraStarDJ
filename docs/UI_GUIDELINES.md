# UltrastarDJ — UI Guidelines & Pre-Build Checklist

> **Consistency is the #1 priority. Read this before writing a single line of UI code.**

---

## Pre-Build Checklist

Before building any new component or modifying any existing one, answer these questions:

### 1. Does an `@material/web` component exist for what I need?

**Always prefer `@material/web` over plain HTML elements. No exceptions.**

| I need a… | Use this MD3 component | Import |
|---|---|---|
| Regular button | `<md-filled-button>` or `<md-text-button>` | `@material/web/button/filled-button.js` |
| Destructive / ghost button | `<md-outlined-button>` | `@material/web/button/outlined-button.js` |
| Tonal button | `<md-filled-tonal-button>` | `@material/web/button/filled-tonal-button.js` |
| Icon-only button | `<md-icon-button>` | `@material/web/iconbutton/icon-button.js` |
| Text input / search | `<md-filled-text-field>` | `@material/web/textfield/filled-text-field.js` |
| Dropdown / select | `<md-filled-select>` + `<md-select-option>` | `@material/web/select/filled-select.js` |
| Toggle switch | `<md-switch>` | `@material/web/switch/switch.js` |
| Checkbox | `<md-checkbox>` | `@material/web/checkbox/checkbox.js` |
| Context menu / popup menu | `<md-menu>` + `<md-menu-item>` | `@material/web/menu/menu.js` |
| Divider line | `<md-divider>` | `@material/web/divider/divider.js` |
| Icon (from Material Symbols) | `<md-icon>icon_name</md-icon>` | `@material/web/icon/icon.js` |
| Filter chips | `<md-filter-chip>` | `@material/web/chips/filter-chip.js` |
| Chip set | `<md-chip-set>` | `@material/web/chips/chip-set.js` |
| Progress indicator | `<md-circular-progress>` / `<md-linear-progress>` | `@material/web/progress/...` |
| Slider | `<md-slider>` | `@material/web/slider/slider.js` |

**If there is an MD3 component for it → use it. No custom HTML fallback.**

---

### 2. Am I using the right icon approach?

- Icons use **Material Symbols** font (already loaded globally via `app.html`)
- Wrap icons in `<md-icon>icon_name</md-icon>` — use `snake_case` icon names
- Find icon names at [fonts.google.com/icons](https://fonts.google.com/icons)
- **Do NOT** create new inline SVG icons unless the Material Symbols library doesn't have it

---

### 3. Am I using the right tokens?

- **Colors** → always `var(--md-sys-color-*)` — never hex codes, never `rgb()` literals
- **Spacing** → always `var(--space-*)` — never `px` values (except for 1px borders)
- **Typography** → always `var(--text-*)` and `var(--font-*)` tokens
- **Radius** → always `var(--radius-*)` tokens
- **Elevation / shadow** → always `var(--elevation-*)` tokens
- **Overriding `@material/web` internals** → use `--md-*` CSS custom properties only, never `::part()` unless absolutely unavoidable

All tokens are defined in `src/app.css`. **Read it before adding any new styling.**

---

### 4. Am I repeating something that already exists?

Check these before creating anything new:

| What | Where |
|---|---|
| All design tokens | `src/app.css` |
| Reusable UI primitives | `src/components/ui/` |
| All modal/dialog content | `src/components/dialogs/` |
| Tauri IPC calls | `src/lib/ipc/tauri.ts` |
| App settings & theme | `src/lib/stores/settings.svelte.ts` |
| Song queue state | `src/lib/stores/queue.svelte.ts` |
| Layout/panel state | `src/lib/stores/layout.svelte.ts` |
| Player state | `src/lib/stores/player.svelte.ts` |

---

### 5. Am I introducing new CSS variables?

- Only add new tokens to `src/app.css` — never define `--my-var` inside a component `<style>` block
- If you add a dark-mode token, also add it in the `:root.light {}` block

---

### 6. Am I respecting the Svelte 5 rules?

```svelte
<!-- ✅ Correct -->
let count = $state(0)
let doubled = $derived(count * 2)
let { title }: { title: string } = $props()

<!-- ❌ Wrong -->
import { writable } from 'svelte/store'   // never
export let title: string                  // never
```

- Store files → `.svelte.ts` extension
- No `@tauri-apps/*` imports in components → use `$lib/ipc/tauri.ts`

---

## Component Anatomy Template

Every new component should follow this structure:

```svelte
<script lang="ts">
  // 1. MD3 component imports (side-effect only)
  import '@material/web/button/filled-button.js'

  // 2. Svelte/store imports
  import { myStore } from '$lib/stores/myStore.svelte'

  // 3. Props ($props rune)
  let { onaction }: { onaction: () => void } = $props()

  // 4. Local state ($state/$derived)
  let open = $state(false)
</script>

<!-- 5. Markup — only @material/web or structural HTML (div, section, etc.) -->

<style>
  /* 6. Only layout/positioning — NO color, NO hardcoded spacing (use tokens) */
</style>
```

---

## Prohibited Patterns

These are **never** allowed:

```svelte
<!-- ❌ Plain interactive HTML when an MD3 component exists -->
<button>Click me</button>          <!-- use <md-filled-button> or <md-text-button> -->
<input type="text" />              <!-- use <md-filled-text-field> -->
<select><option /></select>        <!-- use <md-filled-select> + <md-select-option> -->
<input type="checkbox" />          <!-- use <md-checkbox> or <md-switch> -->

<!-- ❌ Hardcoded values -->
<div style="color: #6750a4">       <!-- never inline styles -->
<div style="margin: 16px">        <!-- never inline styles -->
.foo { color: #ffffff }            <!-- use var(--md-sys-color-on-surface) -->
.foo { padding: 12px }             <!-- use var(--space-3) -->

<!-- ❌ SVG icons when Material Symbol exists -->
<svg>...</svg>                     <!-- use <md-icon>library_music</md-icon> -->
```

---

## Quick Reference: Most-Used Patterns

### Filled primary button
```svelte
import '@material/web/button/filled-button.js'
<md-filled-button onclick={handler}>Label</md-filled-button>
```

### Text / ghost button
```svelte
import '@material/web/button/text-button.js'
<md-text-button onclick={handler}>Label</md-text-button>
```

### Icon button
```svelte
import '@material/web/iconbutton/icon-button.js'
import '@material/web/icon/icon.js'
<md-icon-button onclick={handler} aria-label="Close">
  <md-icon>close</md-icon>
</md-icon-button>
```

### Search / text field
```svelte
import '@material/web/textfield/filled-text-field.js'
<md-filled-text-field
  label="Search songs"
  bind:value={query}
  type="search"
>
  <md-icon slot="leading-icon">search</md-icon>
</md-filled-text-field>
```

### Select dropdown
```svelte
import '@material/web/select/filled-select.js'
import '@material/web/select/select-option.js'
<md-filled-select label="Language" value={selectedLanguage}
  onchange={(e) => selectedLanguage = e.target.value}>
  <md-select-option value="">All</md-select-option>
  {#each options as opt}
    <md-select-option value={opt}>{opt}</md-select-option>
  {/each}
</md-filled-select>
```

### Switch (toggle)
```svelte
import '@material/web/switch/switch.js'
<md-switch selected={enabled} onchange={(e) => enabled = e.target.selected} />
```

### Checkbox
```svelte
import '@material/web/checkbox/checkbox.js'
<md-checkbox checked={value} onchange={(e) => value = e.target.checked} />
```

---

*Last updated: Sprint 1. Extend this file as new component types are introduced.*
