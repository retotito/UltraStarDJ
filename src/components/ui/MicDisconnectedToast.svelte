<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { playersStore } from '$lib/stores/players.svelte'
  import { onMicDisconnected, onMicReconnected, onDevicesChanged } from '$lib/ipc/tauri'

  interface Toast {
    id: number
    type: 'disconnected' | 'reconnected'
    playerName: string
    deviceId: string
  }

  let toasts = $state<Toast[]>([])
  let nextId = 0

  // Remember which device was last disconnected per player so reconnect can match
  const lastDisconnectedDevice = new Map<number, string>() // playerId → deviceId

  let unlistenDisconnected: (() => void) | null = null
  let unlistenReconnected: (() => void) | null = null
  let unlistenDevices: (() => void) | null = null

  function addToast(toast: Omit<Toast, 'id'>) {
    const id = ++nextId
    toasts = [...toasts, { ...toast, id }]
    setTimeout(() => dismiss(id), 4000)
  }

  function dismiss(id: number) {
    toasts = toasts.filter(t => t.id !== id)
  }

  onMount(async () => {
    unlistenDisconnected = await onMicDisconnected(e => {
      const player = playersStore.all.find(p => p.mic?.deviceId === e.device_id)
        ?? playersStore.getById(e.player_id)
      if (!player) return
      lastDisconnectedDevice.set(player.id, e.device_id)
      playersStore.setMic(player.id, null)
      playersStore.setDisconnected(player.id, false)
      addToast({ type: 'disconnected', playerName: player.name, deviceId: e.device_id })
    })

    // Also catch disconnects for assigned-but-not-testing mics via devices-changed
    unlistenDevices = await onDevicesChanged(updatedDevices => {
      for (const player of playersStore.all) {
        if (!player.mic) continue
        const stillExists = updatedDevices.some(d => d.id === player.mic!.deviceId)
        if (!stillExists) {
          const deviceId = player.mic.deviceId
          lastDisconnectedDevice.set(player.id, deviceId)
          playersStore.setMic(player.id, null)
          playersStore.setDisconnected(player.id, false)
          addToast({ type: 'disconnected', playerName: player.name, deviceId })
        }
      }
    })

    unlistenReconnected = await onMicReconnected(e => {
      addToast({ type: 'reconnected', playerName: '', deviceId: e.device_id })
    })
  })

  onDestroy(() => {
    unlistenDisconnected?.()
    unlistenReconnected?.()
    unlistenDevices?.()
  })
</script>

{#if toasts.length > 0}
  <div class="toast-container" role="status" aria-live="polite">
    {#each toasts as toast (toast.id)}
      <div class="toast" class:toast-warn={toast.type === 'disconnected'} class:toast-ok={toast.type === 'reconnected'}>
        <span class="icon toast-icon">
          {toast.type === 'disconnected' ? 'mic_off' : 'mic'}
        </span>
        <div class="toast-body">
          <span class="toast-title">
            {toast.type === 'disconnected' ? 'Mic disconnected' : 'New mic connected'}
          </span>
          <span class="toast-sub">
            {toast.type === 'disconnected' ? `${toast.playerName} — ${toast.deviceId}` : toast.deviceId}
          </span>
        </div>
        <button class="toast-close btn btn-icon" onclick={() => dismiss(toast.id)} aria-label="Dismiss">
          <span class="icon">close</span>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    z-index: 9999;
    pointer-events: none;
  }

  .toast {
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

  .toast-warn {
    border-left: 3px solid #f75f5f;
  }

  .toast-ok {
    border-left: 3px solid #4ecb71;
  }

  .toast-icon {
    font-size: 22px;
    flex-shrink: 0;
  }

  .toast-warn .toast-icon { color: #f75f5f; }
  .toast-ok  .toast-icon { color: #4ecb71; }

  .toast-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toast-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }

  .toast-sub {
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
  }

  .toast-close {
    width: 28px;
    height: 28px;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
