<script lang="ts">
  import type { Song } from '$lib/ultrastar/types'
  import { layout } from '$lib/stores/layout.svelte'
  import { songQueue } from '$lib/stores/queue.svelte'
  import { player } from '$lib/stores/player.svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import { appSettings } from '$lib/stores/settings.svelte'
  import { validateSong } from '$lib/ultrastar/validate_song'
  import { enrichUsdbSong, requiresInternet } from '$lib/ultrastar/usdb-load'
  import { network } from '$lib/stores/network.svelte'
  import { errorStore } from '$lib/stores/error.svelte'
  import { tooltip } from '$lib/tooltip'

  let { songs }: { songs: Song[] } = $props()

  type SortKey = 'title' | 'artist' | 'year' | 'language' | 'bpm' | 'genre' | 'rating'
  let sortKey = $state<SortKey>('title')
  let sortAsc = $state(true)
  let hoveredId = $state<string | null>(null)
  let menuSongId = $state<string | null>(null)
  let menuPos = $state({ x: 0, y: 0 })
  let menuEl = $state<HTMLElement | null>(null)

  $effect(() => {
    if (!menuEl) return
    const { height } = menuEl.getBoundingClientRect()
    const vh = window.innerHeight
    const MARGIN = 40
    if (menuPos.y + height > vh - MARGIN) {
      menuPos = { ...menuPos, y: Math.max(8, vh - height - MARGIN) }
    }
  })
  const sorted = $derived(
    [...songs].sort((a, b) => {
      const val = (s: Song) => sortKey === 'rating' ? (s.usdbViews ?? -1) : (s[sortKey as keyof Song] ?? '')
      const av = val(a) as string | number
      const bv = val(b) as string | number
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortAsc ? cmp : -cmp
    })
  )

  function setSort(key: SortKey) {
    if (sortKey === key) sortAsc = !sortAsc
    else { sortKey = key; sortAsc = true }
  }

  const MENU_W = 180
  const MENU_H = 120 // approximate — enough to clamp bottom overflow

  function openMenu(e: MouseEvent, song: Song) {
    e.stopPropagation()
    menuSongId = song.id
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = e.clientX
    let y = e.clientY
    if (x + MENU_W > vw) x = vw - MENU_W - 8
    if (y + MENU_H > vh) y = vh - MENU_H - 8
    if (x < 8) x = 8
    if (y < 8) y = 8
    menuPos = { x, y }
  }

  function closeMenu() { menuSongId = null }

  async function previewSong(song: Song) {
    if (requiresInternet(song) && !network.isOnline) {
      errorStore.show('You\'re offline', ['This song requires a YouTube connection and cannot be played without internet.'])
      return
    }
    try {
      const s = song.usdbId ? await enrichUsdbSong(song) : song
      const result = await validateSong(s)
      if (!result.valid) { errorStore.show('Song cannot be previewed', result.errors.map(e => e.message)); return }
      player.clear()
      player.load(result.song)
    } catch (e) {
      errorStore.show('Cannot preview song', [String(e)])
    }
  }

  async function addToQueue(song: Song) {
    if (requiresInternet(song) && !network.isOnline) {
      errorStore.show('You\'re offline', ['This song requires a YouTube connection and cannot be queued without internet.'])
      return
    }
    closeMenu()
    try {
      const s = song.usdbId ? await enrichUsdbSong(song) : song
      const result = await validateSong(s)
      if (!result.valid) { errorStore.show('Song cannot be loaded', result.errors.map(e => e.message)); return }
      songQueue.add(result.song)
    } catch (e) {
      errorStore.show('Cannot add song to queue', [String(e)])
    }
  }

  async function loadSong(song: Song) {
    if (!playback.canLoad) return
    closeMenu()
    try {
      const s = song.usdbId ? await enrichUsdbSong(song) : song
      const result = await validateSong(s)
      if (!result.valid) { errorStore.show('Song cannot be loaded', result.errors.map(e => e.message)); return }
      await playback.load(result.song)
    } catch (e) {
      errorStore.show('Cannot load song', [String(e)])
    }
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

  // ── Virtual scroll ────────────────────────────────────────────────────────
  const ROW_H   = 36   // px per row — must match CSS
  const BUFFER  = 20   // extra rows above/below viewport

  let wrapEl    = $state<HTMLElement | undefined>(undefined)
  let wrapH     = $state(600)
  let scrollTop = $state(0)

  $effect(() => {
    if (!wrapEl) return
    const ro = new ResizeObserver(entries => { wrapH = entries[0].contentRect.height })
    ro.observe(wrapEl)
    return () => ro.disconnect()
  })

  const startIdx = $derived(Math.max(0, Math.floor(scrollTop / ROW_H) - BUFFER))
  const endIdx   = $derived(Math.min(sorted.length, Math.ceil((scrollTop + wrapH) / ROW_H) + BUFFER))
  const topPad   = $derived(startIdx * ROW_H)
  const botPad   = $derived(Math.max(0, (sorted.length - endIdx) * ROW_H))
  const visible  = $derived(sorted.slice(startIdx, endIdx))

  function sortLabel(key: SortKey) {
    if (sortKey !== key) return ''
    return sortAsc ? ' ▲' : ' ▼'
  }
</script>

<div class="table-wrap" bind:this={wrapEl} onscroll={(e) => scrollTop = (e.currentTarget as HTMLElement).scrollTop}>
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
      <!-- top spacer -->
      {#if topPad > 0}<tr style="height: {topPad}px"><td colspan="99"></td></tr>{/if}
      {#each visible as song, vi (song.id)}
        {@const i = startIdx + vi}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <tr
          class="song-row"
          class:selected={player.song?.id === song.id}
          class:hovered={hoveredId === song.id}
          class:offline-song={requiresInternet(song) && !network.isOnline}
          title={requiresInternet(song) && !network.isOnline ? 'You\'re offline — this song requires a YouTube connection' : undefined}
          ondblclick={() => previewSong(song)}
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
            {:else if col.key === 'rating'}
              <td class="col-narrow text-muted">
                {#if song.usdbViews != null}
                  {song.usdbViews >= 2000 ? '★★★★' : song.usdbViews >= 1000 ? '★★★' : song.usdbViews >= 500 ? '★★' : '★'}
                {:else}
                  —
                {/if}
              </td>
            {:else if col.key === 'source'}
              <td>
                {#if song.sourceId === 'usdb'}
                  <span class="usdb-source-badge">USDB</span>
                {:else}
                  <span class="text-muted">{appSettings.sources.find(s => s.id === song.sourceId)?.label ?? song.sourceId}</span>
                {/if}
              </td>
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
      <!-- bottom spacer -->
      {#if botPad > 0}<tr style="height: {botPad}px"><td colspan="99"></td></tr>{/if}
    </tbody>
  </table>
</div>


<!-- Row context menu -->
{#if menuSongId}
  {@const menuSong = sorted.find(s => s.id === menuSongId)!}
  {@const menuOffline = requiresInternet(menuSong) && !network.isOnline}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="row-menu"
    style="left: {menuPos.x}px; top: {menuPos.y}px"
    role="menu"
    bind:this={menuEl}
  >
    <button class="menu-item" role="menuitem" onclick={() => { previewSong(menuSong); closeMenu() }} class:disabled={menuOffline} title={menuOffline ? 'You\'re offline' : undefined}>
      <span class="icon icon-sm">play_arrow</span> Preview
    </button>
    <button class="menu-item" role="menuitem" onclick={() => { if (playback.canLoad && !menuOffline) loadSong(menuSong) }} class:disabled={!playback.canLoad || menuOffline}
      use:tooltip={menuOffline ? 'You\'re offline' : playback.status === 'playing' ? 'Song is playing — stop it first' : playback.status === 'paused' ? 'Song is paused — stop it first' : undefined}>
      <span class="icon icon-sm">play_circle</span> Load into player
    </button>
    <button class="menu-item" role="menuitem" onclick={() => addToQueue(menuSong)} class:disabled={menuOffline} title={menuOffline ? 'You\'re offline' : undefined}>
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
    color: var(--md-sys-color-on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
  }

  .song-row {
    cursor: pointer;
    transition: background var(--transition-fast);
    height: 36px;  /* must match ROW_H constant */
  }
  .song-row:nth-child(even) {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 4%, transparent);
  }
  .song-row:hover {
    background: var(--color-table-row-hover);
  }
  .song-row.selected {
    background: var(--color-table-row-selected);
  }

  .song-row.offline-song {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .song-row.offline-song:hover {
    background: transparent;
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
  .menu-item.disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }

  .menu-divider {
    height: 1px;
    background: var(--md-sys-color-outline-variant);
    margin: var(--space-1) 0;
  }

  .usdb-source-badge {
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    background: #22c55e;
    color: #fff;
    border-radius: 4px;
    padding: 1px 5px;
  }
</style>
