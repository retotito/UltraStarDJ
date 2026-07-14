<script lang="ts">
  import { layout } from '$lib/stores/layout.svelte'
  import { playersStore } from '$lib/stores/players.svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import { usdbStore } from '$lib/stores/usdb.svelte'
  import { songLibrary } from '$lib/stores/songs.svelte'
  import { network } from '$lib/stores/network.svelte'
  import { onMount, onDestroy } from 'svelte'
  import { onOutputDevicesChanged, onMicLevel, onMicDisconnected, onMicReconnected, onDevicesChanged, listAudioInputDevices, stopMicMonitor } from '$lib/ipc/tauri'
  import { loadAudioOutputDevices, audioOutputDevices } from '$lib/audio/devices.svelte'
  import { previewChannel } from '$lib/audio/channels.svelte'
  import Sidebar from '$components/Sidebar.svelte'
  import LibraryPanel from '$components/views/LibraryPanel.svelte'
  import RightPanel from '$components/views/RightPanel.svelte'
  import MicDisconnectedToast from '$components/ui/MicDisconnectedToast.svelte'
  import NowPlayingBar from '$components/ui/NowPlayingBar.svelte'

  playersStore.load()

  let outputToast = $state<{ message: string; sub: string; type: 'connected' | 'disconnected' } | null>(null)
  let outputToastTimer: ReturnType<typeof setTimeout> | null = null
  let unlistenOutput: (() => void) | null = null
  let unlistenMicLevel: (() => void) | null = null
  let unlistenMicDisconnected: (() => void) | null = null
  let unlistenMicReconnected: (() => void) | null = null
  let unlistenDevicesChanged: (() => void) | null = null

  onMount(async () => {
    // Load USDB catalog from IndexedDB and populate library
    await usdbStore.initialize()
    songLibrary.setUsdbSongs(usdbStore.catalog)
    // Restore USDB session on app start (awaited so session is ready before user interaction)
    if (usdbStore.username) {
      const ok = await usdbStore.autoLogin()
      console.log('[AppShell] USDB auto-login:', ok ? 'OK' : 'FAILED')
    }

    // Validate mic assignments — mark any mic that's no longer plugged in as disconnected
    const availableInputs = await listAudioInputDevices()
    const availableDeviceIds = new Set(availableInputs.map(d => d.id))
    console.log('[AppShell] available input devices:', availableInputs.map(d => `${d.id} (${d.name})`))
    for (const p of playersStore.all) {
      console.log(`[AppShell] player ${p.id} mic:`, p.mic ? `${p.mic.deviceId} — available: ${availableDeviceIds.has(p.mic.deviceId)}` : 'none')
      if (p.mic && !availableDeviceIds.has(p.mic.deviceId)) {
        console.log(`[AppShell] → clearing player ${p.id} mic (not available at startup)`)
        playersStore.setMic(p.id, null)
      }
    }

    // Validate persisted preview output device — reset to system default if not available
    await loadAudioOutputDevices()
    const availableOutputIds = audioOutputDevices.list.map(d => d.id)
    await previewChannel.resetIfDeviceGone(availableOutputIds)

    // Global mic level listener — always active, independent of popup state
    unlistenMicLevel = await onMicLevel(e => {
      if (playersStore.monitoringIds.has(e.player_id)) {
        playersStore.setLevel(e.player_id, e.rms)
      }
    })

    unlistenMicDisconnected = await onMicDisconnected(async e => {
      playersStore.setMonitoring(e.player_id, false)
      playersStore.setLevel(e.player_id, 0)
      await stopMicMonitor(e.player_id).catch(() => {})
    })

    unlistenMicReconnected = await onMicReconnected(async e => {
      const devices = await listAudioInputDevices()
      for (const p of playersStore.all) {
        if (p.mic?.deviceId === e.device_id) {
          playersStore.setDisconnected(p.id, false)
        }
      }
    })

    unlistenDevicesChanged = await onDevicesChanged(async () => {
      // Devices list changes handled locally in PlayersView when open
    })
    unlistenOutput = await onOutputDevicesChanged(async () => {
      const before = audioOutputDevices.list.map(d => d.name)
      await loadAudioOutputDevices()
      const after = audioOutputDevices.list.map(d => d.name)
      const availableIds = audioOutputDevices.list.map(d => d.id)
      const added = after.find(n => !before.includes(n))
      const removed = before.find(n => !after.includes(n))

      // Reset preview channel to system default if its device was unplugged
      await previewChannel.resetIfDeviceGone(availableIds)
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

  onDestroy(() => {
    unlistenOutput?.()
    unlistenMicLevel?.()
    unlistenMicDisconnected?.()
    unlistenMicReconnected?.()
    unlistenDevicesChanged?.()
  })

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

  <!-- Right panel -->
  <aside class="right-area" style="width: {layout.rightPanelWidth}px">
    <RightPanel />
  </aside>
</div>

<MicDisconnectedToast />
<NowPlayingBar />

{#if !network.isOnline}
  <div class="offline-badge" role="status" aria-label="No internet connection">
    <span class="icon" style="font-size:16px">wifi_off</span>
    Offline
  </div>
{/if}

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

  .offline-badge {
    position: fixed;
    top: 4px;
    right: var(--space-3);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border-radius: 999px;
    background: var(--md-sys-color-error);
    color: var(--md-sys-color-on-error);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    pointer-events: none;
    user-select: none;
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
