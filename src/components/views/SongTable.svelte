<script lang="ts">
  import type { Song } from '$lib/ultrastar/types'
  import { layout } from '$lib/stores/layout.svelte'
  import { songQueue } from '$lib/stores/queue.svelte'
  import { player } from '$lib/stores/player.svelte'

  let { songs }: { songs: Song[] } = $props()

  type SortKey = 'title' | 'artist' | 'year' | 'language' | 'bpm' | 'genre'
  let sortKey = $state<SortKey>('title')
  let sortAsc = $state(true)
  let hoveredId = $state<string | null>(null)
  let menuSongId = $state<string | null>(null)
  let menuPos = $state({ x: 0, y: 0 })

  const sorted = $derived(
    [...songs].sort((a, b) => {
      const av = (a[sortKey] ?? '') as string | number
      const bv = (b[sortKey] ?? '') as string | number
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortAsc ? cmp : -cmp
    })
  )

  function setSort(key: SortKey) {
    if (sortKey === key) sortAsc = !sortAsc
    else { sortKey = key; sortAsc = true }
  }

  function openMenu(e: MouseEvent, song: Song) {
    e.stopPropagation()
    menuSongId = song.id
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    menuPos = { x: rect.left - 160, y: rect.bottom + 4 }
  }

  function closeMenu() { menuSongId = null }

  function handleRowClick(song: Song) {
    // Show song in player widget
    player.load(song)
  }

  function addToQueue(song: Song) {
    songQueue.add(song)
    closeMenu()
  }

  $effect(() => {
    if (menuSongId !== null) {
      const close = (e: MouseEvent) => {
        if (!(e.target as Element)?.closest('.row-menu')) closeMenu()
      }
      document.addEventListener('click', close)
      return () => document.removeEventListener('click', close)
    }
  })

  function sortLabel(key: SortKey) {
    if (sortKey !== key) return ''
    return sortAsc ? ' ▲' : ' ▼'
  }
</script>

<div class="table-wrap">
  <table class="song-table">
    <thead>
      <tr>
        {#each layout.visibleColumns as col (col.key)}
          {#if col.key === 'index'}
            <th class="col-index">#</th>
          {:else}
            <th
              class="sortable"
              onclick={() => setSort(col.key as SortKey)}
              role="columnheader"
              aria-sort={sortKey === col.key ? (sortAsc ? 'ascending' : 'descending') : 'none'}
            >
              {col.label}{sortLabel(col.key as SortKey)}
            </th>
          {/if}
        {/each}
        <th class="col-actions"></th>
      </tr>
    </thead>
    <tbody>
      {#each sorted as song, i (song.id)}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <tr
          class="song-row"
          class:selected={player.song?.id === song.id}
          class:hovered={hoveredId === song.id}
          onclick={() => handleRowClick(song)}
          onmouseenter={() => hoveredId = song.id}
          onmouseleave={() => hoveredId = null}
          oncontextmenu={(e) => { e.preventDefault(); openMenu(e, song) }}
        >
          {#each layout.visibleColumns as col (col.key)}
            {#if col.key === 'index'}
              <td class="col-index text-muted">{i + 1}</td>
            {:else if col.key === 'title'}
              <td class="col-title">{song.title}</td>
            {:else if col.key === 'artist'}
              <td class="text-muted">{song.artist}</td>
            {:else if col.key === 'year'}
              <td class="col-narrow text-muted">{song.year ?? '—'}</td>
            {:else if col.key === 'language'}
              <td class="col-narrow">
                <span class="lang-chip">{song.language ?? '—'}</span>
              </td>
            {:else if col.key === 'bpm'}
              <td class="col-narrow text-muted">{song.bpm}</td>
            {:else if col.key === 'genre'}
              <td class="text-muted">{song.genre ?? '—'}</td>
            {/if}
          {/each}
          <td class="col-actions">
            <div class="more-wrap" class:visible={hoveredId === song.id || menuSongId === song.id}>
              <button
                class="btn btn-icon-sm more-btn"
                aria-label="More options"
                onclick={(e: MouseEvent) => { e.stopPropagation(); openMenu(e, song) }}
              >
                <span class="icon icon-sm">more_horiz</span>
              </button>
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>


<!-- Row context menu -->
{#if menuSongId}
  {@const menuSong = sorted.find(s => s.id === menuSongId)!}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="row-menu"
    style="left: {menuPos.x}px; top: {menuPos.y}px"
    role="menu"
  >
    <button class="menu-item" role="menuitem" onclick={() => { player.load(menuSong); closeMenu() }}>
      <span class="icon icon-sm">play_arrow</span> Preview
    </button>
    <button class="menu-item" role="menuitem" onclick={() => addToQueue(menuSong)}>
      <span class="icon icon-sm">queue_music</span> Add to queue
    </button>
    <div class="menu-divider"></div>
    <button class="menu-item text-muted" role="menuitem" onclick={closeMenu}>
      <span class="icon icon-sm">info</span> Details
    </button>
  </div>
{/if}

<style>
  .table-wrap {
    flex: 1;
    overflow: auto;
  }

  .song-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  thead th {
    position: sticky;
    top: 0;
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface-variant);
    font-weight: var(--font-weight-semibold);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: var(--space-2) var(--space-3);
    text-align: left;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    white-space: nowrap;
    z-index: 1;
  }

  th.sortable {
    cursor: pointer;
    user-select: none;
    transition: color var(--transition-fast);
  }
  th.sortable:hover {
    color: var(--md-sys-color-on-surface);
  }

  .song-row td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-table-border);
    color: var(--md-sys-color-on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
  }

  .song-row {
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .song-row:hover {
    background: var(--color-table-row-hover);
  }
  .song-row.selected {
    background: var(--color-table-row-selected);
  }

  .col-index {
    width: 40px;
    text-align: right;
    color: var(--md-sys-color-on-surface-variant);
  }
  .col-narrow { width: 80px; }
  .col-title { font-weight: var(--font-weight-medium); }
  .col-actions {
    width: 48px;
    text-align: center;
  }

  .lang-chip {
    display: inline-block;
    padding: 1px var(--space-2);
    border-radius: var(--radius-full);
    background: var(--md-sys-color-surface-container-highest);
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
  }

  .more-wrap {
    opacity: 0;
    transition: opacity var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .more-wrap.visible {
    opacity: 1;
  }

  .more-btn {
    color: var(--md-sys-color-on-surface-variant);
  }

  /* Context menu */
  .row-menu {
    position: fixed;
    background: var(--md-sys-color-surface-container-high);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-md);
    box-shadow: var(--elevation-2);
    padding: var(--space-1) 0;
    min-width: 160px;
    z-index: var(--z-overlay);
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    text-align: left;
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    color: var(--md-sys-color-on-surface);
    background: none;
    border: none;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .menu-item:hover { background: var(--color-table-row-hover); }
  .menu-item.text-muted { color: var(--md-sys-color-on-surface-variant); }

  .menu-divider {
    height: 1px;
    background: var(--md-sys-color-outline-variant);
    margin: var(--space-1) 0;
  }
</style>
