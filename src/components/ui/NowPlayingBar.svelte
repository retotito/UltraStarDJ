<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import { displaysStore } from '$lib/stores/displays.svelte'

  const PLAYER_COLORS: Record<number, string> = {
    1: 'var(--player-1)',
    2: 'var(--player-2)',
    3: 'var(--player-3)',
    4: 'var(--player-4)',
  }

  const allPlayerIds = $derived(
    [...new Set([...displaysStore.display1.playerIds, ...displaysStore.display2.playerIds])].sort((a, b) => a - b)
  )

  // Dragging state — null = CSS default (bottom-center)
  let x = $state<number | null>(null)
  let y = $state<number | null>(null)
  let dragging = $state(false)
  let dragStartX = 0
  let dragStartY = 0
  let cardEl: HTMLDivElement | undefined

  function clamp() {
    if (x === null || y === null || !cardEl) return
    x = Math.max(0, Math.min(x, window.innerWidth  - cardEl.offsetWidth))
    y = Math.max(0, Math.min(y, window.innerHeight - cardEl.offsetHeight))
  }

  function onDragStart(e: MouseEvent) {
    if (!cardEl) return
    if (x === null) {
      const rect = cardEl.getBoundingClientRect()
      x = rect.left
      y = rect.top
    }
    dragging = true
    dragStartX = e.clientX - x
    dragStartY = e.clientY - (y ?? 0)
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragEnd)
  }

  function onDragMove(e: MouseEvent) {
    if (!dragging || !cardEl || x === null || y === null) return
    x = e.clientX - dragStartX
    y = e.clientY - dragStartY
    clamp()
  }

  function onDragEnd() {
    dragging = false
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)
  }

  onMount(() => window.addEventListener('resize', clamp))
  onDestroy(() => window.removeEventListener('resize', clamp))
</script>

{#if playback.isLoaded && playback.song}
  <div
    class="now-playing-card"
    class:is-dragging={dragging}
    class:is-positioned={x !== null}
    style={x !== null ? `left: ${x}px; top: ${y}px;` : ''}
    bind:this={cardEl}
  >
    <!-- Drag handle + dismiss -->
    <div class="drag-handle" onmousedown={onDragStart} role="none">
      <span class="handle-dots">⠿</span>
      <button class="btn-dismiss" onclick={() => playback.dismiss()} title="Dismiss" aria-label="Dismiss">
        <span class="icon" style="font-size:16px">close</span>
      </button>
    </div>

    <div class="card-body">
      <!-- Song info -->
      <div class="song-info">
        <span class="song-title">{playback.song.title}</span>
        <span class="song-artist text-muted text-sm">{playback.song.artist}</span>
      </div>

      <!-- Player badges -->
      {#if allPlayerIds.length > 0}
        <div class="player-badges">
          {#each allPlayerIds as id (id)}
            <span class="badge" style="border-color: {PLAYER_COLORS[id] ?? '#888'}; color: {PLAYER_COLORS[id] ?? '#888'}">
              P{id}
            </span>
          {/each}
        </div>
      {/if}

      <!-- Transport controls -->
      <div class="controls">
        {#if playback.status === 'loaded'}
          <button
            class="btn btn-icon"
            disabled={!playback.canPlay}
            title={!playback.canPlay ? 'Open a display first' : 'Play'}
            onclick={() => playback.play()}
          >
            <span class="icon">play_arrow</span>
          </button>
        {:else if playback.status === 'playing'}
          <button class="btn btn-icon" title="Pause" onclick={() => playback.pause()}>
            <span class="icon">pause</span>
          </button>
          <button class="btn btn-icon btn-danger" title="Stop" onclick={() => playback.stop()}>
            <span class="icon">stop</span>
          </button>
        {:else if playback.status === 'paused'}
          <button class="btn btn-icon" title="Resume" onclick={() => playback.resume()}>
            <span class="icon">play_arrow</span>
          </button>
          <button class="btn btn-icon btn-danger" title="Stop" onclick={() => playback.stop()}>
            <span class="icon">stop</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .now-playing-card {
    position: fixed;
    bottom: var(--space-6);
    left: 50%;
    translate: -50% 0;
    z-index: 200;
    background: var(--md-sys-color-surface-container-high);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    min-width: 320px;
    max-width: 480px;
    user-select: none;
  }

  /* After first drag: switch to top/left absolute positioning */
  .now-playing-card.is-positioned {
    bottom: unset;
    left: unset;
    translate: none;
  }

  .drag-handle {
    padding: var(--space-1) var(--space-3);
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--md-sys-color-on-surface-variant);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    position: relative;
  }
  .drag-handle:hover { background: rgba(255,255,255,0.04); }
  .is-dragging .drag-handle { cursor: grabbing; }

  .handle-dots { font-size: 14px; letter-spacing: 2px; opacity: 0.4; }

  .btn-dismiss {
    position: absolute;
    right: var(--space-2);
    top: 50%;
    translate: 0 -50%;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.4;
    padding: 2px;
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }
  .btn-dismiss:hover { opacity: 1; background: rgba(255,255,255,0.08); }

  .card-body {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4) var(--space-3);
  }

  .song-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .song-title {
    font-weight: 600;
    font-size: var(--text-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .player-badges {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: var(--radius-full);
    border: 2px solid;
  }

  .controls {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }
</style>
