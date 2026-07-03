<script lang="ts">
  import { playback } from '$lib/stores/playback.svelte'
  import { displaysStore } from '$lib/stores/displays.svelte'

  const PLAYER_COLORS: Record<number, string> = {
    1: 'var(--player-1)',
    2: 'var(--player-2)',
    3: 'var(--player-3)',
    4: 'var(--player-4)',
  }

  // All player IDs across both displays (deduplicated)
  const allPlayerIds = $derived(
    [...new Set([...displaysStore.display1.playerIds, ...displaysStore.display2.playerIds])].sort((a, b) => a - b)
  )

  // Dragging state
  let x = $state<number | null>(null)  // null = use CSS default centering
  let y = $state<number | null>(null)
  let dragging = $state(false)
  let dragStartX = 0
  let dragStartY = 0
  let cardEl: HTMLDivElement | undefined

  function onDragStart(e: MouseEvent) {
    if (!cardEl) return
    // On first drag, capture current rendered position
    if (x === null) {
      const rect = cardEl.getBoundingClientRect()
      x = rect.left
      y = rect.top
    }
    dragging = true
    dragStartX = e.clientX - x
    dragStartY = e.clientY - y
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragEnd)
  }

  function onDragMove(e: MouseEvent) {
    if (!dragging || !cardEl || x === null || y === null) return
    const newX = e.clientX - dragStartX
    const newY = e.clientY - dragStartY
    const maxX = window.innerWidth  - cardEl.offsetWidth
    const maxY = window.innerHeight - cardEl.offsetHeight
    x = Math.max(0, Math.min(newX, maxX))
    y = Math.max(0, Math.min(newY, maxY))
  }

  function onDragEnd() {
    dragging = false
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)
  }
</script>

{#if playback.isActive && playback.song}
  <div
    class="now-playing-card"
    class:is-dragging={dragging}
    class:is-positioned={x !== null}
    style={x !== null ? `left: ${x}px; top: ${y}px;` : ''}
    bind:this={cardEl}
  >
    <!-- Drag handle -->
    <div class="drag-handle" onmousedown={onDragStart} role="none">
      <span class="handle-dots">⠿</span>
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
        {#if playback.status === 'playing'}
          <button class="btn btn-icon" title="Pause" onclick={() => playback.pause()}>
            <span class="icon">pause</span>
          </button>
        {:else}
          <button class="btn btn-icon" title="Resume" onclick={() => playback.resume()}>
            <span class="icon">play_arrow</span>
          </button>
        {/if}
        <button class="btn btn-icon btn-danger" title="Stop" onclick={() => playback.stop()}>
          <span class="icon">stop</span>
        </button>
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
    padding: var(--space-1) var(--space-4);
    cursor: grab;
    display: flex;
    justify-content: center;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.5;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
  .drag-handle:hover { opacity: 1; }
  .is-dragging .drag-handle { cursor: grabbing; }

  .handle-dots { font-size: 14px; letter-spacing: 2px; }

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
