<script lang="ts">
  import { layout } from '$lib/stores/layout.svelte'
  import { playersStore } from '$lib/stores/players.svelte'
  import { onMount, onDestroy } from 'svelte'
  import { onOutputDevicesChanged } from '$lib/ipc/tauri'
  import { loadAudioOutputDevices, audioOutputDevices } from '$lib/audio/devices.svelte'
  import Sidebar from '$components/Sidebar.svelte'
  import LibraryPanel from '$components/views/LibraryPanel.svelte'
  import RightPanel from '$components/views/RightPanel.svelte'
  import MicDisconnectedToast from '$components/ui/MicDisconnectedToast.svelte'
  import NowPlayingBar from '$components/ui/NowPlayingBar.svelte'

  playersStore.load()

  let outputToast = $state<{ message: string; sub: string; type: 'connected' | 'disconnected' } | null>(null)
  let outputToastTimer: ReturnType<typeof setTimeout> | null = null
  let unlistenOutput: (() => void) | null = null

  onMount(async () => {
    unlistenOutput = await onOutputDevicesChanged(async () => {
      const before = audioOutputDevices.list.map(d => d.name)
      await loadAudioOutputDevices()
      const after = audioOutputDevices.list.map(d => d.name)
      const added = after.find(n => !before.includes(n))
      const removed = before.find(n => !after.includes(n))
      if (outputToastTimer) clearTimeout(outputToastTimer)
      if (added) {
        outputToast = { message: 'Output device connected', sub: added, type: 'connected' }
      } else if (removed) {
        outputToast = { message: 'Output device removed', sub: removed, type: 'disconnected' }
      } else {
        outputToast = { message: 'Audio outputs updated', sub: '', type: 'connected' }
      }
      outputToastTimer = setTimeout(() => outputToast = null, 3000)
    })
  })

  onDestroy(() => { unlistenOutput?.() })

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

<MicDisconnectedToast />
<NowPlayingBar />

{#if outputToast}
  <div class="output-toast-container" role="status" aria-live="polite">
    <div class="output-toast" class:toast-ok={outputToast.type === 'connected'} class:toast-warn={outputToast.type === 'disconnected'}>
      <span class="icon output-toast-icon">speaker</span>
      <div class="output-toast-body">
        <span class="output-toast-title">{outputToast.message}</span>
        {#if outputToast.sub}<span class="output-toast-sub">{outputToast.sub}</span>{/if}
      </div>
      <button class="btn btn-icon output-toast-close" onclick={() => outputToast = null} aria-label="Dismiss">
        <span class="icon">close</span>
      </button>
    </div>
  </div>
{/if}

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

  .output-toast-container {
    position: fixed;
    top: calc(50% + 100px);
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9999;
    pointer-events: none;
  }

  .output-toast {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--md-sys-color-surface-container-highest);
    box-shadow: var(--elevation-3);
    min-width: 320px;
    pointer-events: all;
    animation: toast-in 200ms ease;
  }

  .output-toast.toast-ok  { border-left: 3px solid #4ecb71; }
  .output-toast.toast-warn { border-left: 3px solid #f75f5f; }

  .output-toast-icon { font-size: 22px; flex-shrink: 0; }
  .output-toast.toast-ok   .output-toast-icon { color: #4ecb71; }
  .output-toast.toast-warn .output-toast-icon { color: #f75f5f; }

  .output-toast-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .output-toast-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }

  .output-toast-sub {
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
  }

  .output-toast-close {
    width: 28px;
    height: 28px;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
