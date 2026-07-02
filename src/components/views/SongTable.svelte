<script lang="ts">
  import '@material/web/iconbutton/icon-button.js'
  import '@material/web/icon/icon.js'
  import '@material/web/menu/menu.js'
  import '@material/web/menu/menu-item.js'
  import '@material/web/divider/divider.js'
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
              <md-icon-button
                id={`more-${song.id}`}
                aria-label="More options"
                onclick={(e: MouseEvent) => { e.stopPropagation(); openMenu(e, song) }}
              >
                <md-icon>more_horiz</md-icon>
              </md-icon-button>
            </div>
            {#if menuSongId === song.id}
              <md-menu
                anchor={`more-${song.id}`}
                open
                onclose={closeMenu}
              >
                <md-menu-item onclick={() => { player.load(song); closeMenu() }}>
                  <md-icon slot="start">play_arrow</md-icon>
                  <span slot="headline">Preview</span>
                </md-menu-item>
                <md-menu-item onclick={() => addToQueue(song)}>
                  <md-icon slot="start">queue_music</md-icon>
                  <span slot="headline">Add to queue</span>
                </md-menu-item>
                <md-divider></md-divider>
                <md-menu-item onclick={closeMenu}>
                  <md-icon slot="start">info</md-icon>
                  <span slot="headline">Details</span>
                </md-menu-item>
              </md-menu>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>


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
    --md-icon-button-icon-color: var(--md-sys-color-on-surface-variant);
    --md-icon-button-icon-size: 20px;
  }
  .more-wrap.visible {
    opacity: 1;
  }
</style>
