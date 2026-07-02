<script lang="ts">
  import { layout } from '$lib/stores/layout.svelte'
  import PlayerWidget from '$components/views/PlayerWidget.svelte'
  import QueueWidget from '$components/views/QueueWidget.svelte'

  let isDragging = $state(false)

  function startResize(e: MouseEvent) {
    e.preventDefault()
    isDragging = true
    const startY = e.clientY
    const startPct = layout.rightPlayerHeightPct
    const panel = (e.currentTarget as HTMLElement).closest('.right-panel') as HTMLElement

    function onMove(e: MouseEvent) {
      const totalH = panel.clientHeight
      const delta = e.clientY - startY
      layout.setRightPlayerHeightPct(startPct + (delta / totalH) * 100)
    }
    function onUp() {
      isDragging = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
</script>

<div class="right-panel" class:dragging={isDragging}>
  {#if layout.showPlayer && layout.showQueue}
    <!-- Both visible — split with drag handle -->
    <div class="widget-area" style="height: {layout.rightPlayerHeightPct}%">
      <div class="widget-label">Player</div>
      <PlayerWidget />
    </div>
    <!-- Vertical drag handle -->
    <div
      class="v-drag-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize player and queue"
      onmousedown={startResize}
    ></div>
    <div class="widget-area" style="height: {100 - layout.rightPlayerHeightPct}%">
      <div class="widget-label">Queue</div>
      <QueueWidget />
    </div>

  {:else if layout.showPlayer}
    <div class="widget-area full">
      <div class="widget-label">Player</div>
      <PlayerWidget />
    </div>

  {:else if layout.showQueue}
    <div class="widget-area full">
      <div class="widget-label">Queue</div>
      <QueueWidget />
    </div>
  {/if}
</div>

<style>
  .right-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--md-sys-color-surface);
    overflow: hidden;
  }

  .right-panel.dragging {
    cursor: row-resize;
    user-select: none;
  }

  .widget-area {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 80px;
  }
  .widget-area.full { flex: 1; }

  .widget-label {
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--md-sys-color-on-surface-variant);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }

  .v-drag-handle {
    height: 4px;
    flex-shrink: 0;
    background: var(--md-sys-color-outline-variant);
    cursor: row-resize;
    transition: background var(--transition-fast);
  }
  .v-drag-handle:hover,
  .right-panel.dragging .v-drag-handle {
    background: var(--md-sys-color-primary);
  }
</style>
