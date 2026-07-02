<script lang="ts">
  import { layout } from '$lib/stores/layout.svelte'
  import Sidebar from '$components/Sidebar.svelte'
  import LibraryPanel from '$components/views/LibraryPanel.svelte'
  import RightPanel from '$components/views/RightPanel.svelte'

  let isDragging = $state(false)

  function startResize(e: MouseEvent) {
    e.preventDefault()
    isDragging = true
    const startX = e.clientX
    const startWidth = layout.rightPanelWidth

    function onMove(e: MouseEvent) {
      layout.setRightPanelWidth(startWidth + (startX - e.clientX))
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

<div class="shell" class:dragging={isDragging}>
  <Sidebar />

  <main class="library-area">
    <LibraryPanel />
  </main>

  <!-- Drag handle -->
  <div
    class="drag-handle"
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize panel"
    onmousedown={startResize}
  ></div>

  <!-- Right panel (conditionally rendered, but always takes space when visible) -->
  {#if layout.showPlayer || layout.showQueue}
    <aside class="right-area" style="width: {layout.rightPanelWidth}px">
      <RightPanel />
    </aside>
  {/if}
</div>

<style>
  .shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--md-sys-color-background);
  }

  .shell.dragging {
    cursor: col-resize;
    user-select: none;
  }

  .library-area {
    flex: 1;
    min-width: 300px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .drag-handle {
    width: 4px;
    flex-shrink: 0;
    background: var(--md-sys-color-outline-variant);
    cursor: col-resize;
    transition: background var(--transition-fast);
  }
  .drag-handle:hover,
  .shell.dragging .drag-handle {
    background: var(--md-sys-color-primary);
  }

  .right-area {
    flex-shrink: 0;
    min-width: 220px;
    max-width: 700px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
