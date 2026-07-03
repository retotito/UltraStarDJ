<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { playersStore } from '$lib/stores/players.svelte'
  import {
    listAudioInputDevices,
    startMicMonitor,
    stopMicMonitor,
    onMicLevel,
    onMicDisconnected,
    onMicReconnected,
    onDevicesChanged,
    type AudioInputDevice,
  } from '$lib/ipc/tauri'
  import PlayerCard from '$components/ui/PlayerCard.svelte'

  let { onclose }: { onclose?: () => void } = $props()

  let devices = $state<AudioInputDevice[]>([])

  let unlistenLevel: (() => void) | null = null
  let unlistenDisconnected: (() => void) | null = null
  let unlistenReconnected: (() => void) | null = null
  let unlistenDevices: (() => void) | null = null

  onMount(async () => {
    devices = await listAudioInputDevices()

    unlistenLevel = await onMicLevel(e => {
      playersStore.setLevel(e.player_id, e.rms)
    })

    unlistenDisconnected = await onMicDisconnected(async e => {
      // Stop the dead stream on Rust side; toast handles mic assignment clear
      playersStore.setMonitoring(e.player_id, false)
      playersStore.setLevel(e.player_id, 0)
      await stopMicMonitor(e.player_id).catch(() => {})
    })

    unlistenReconnected = await onMicReconnected(async e => {
      // Refresh device list
      devices = await listAudioInputDevices()
      // If a player had this device assigned, clear disconnected state
      for (const p of playersStore.all) {
        if (p.mic?.deviceId === e.device_id) {
          playersStore.setDisconnected(p.id, false)
        }
      }
    })

    unlistenDevices = await onDevicesChanged(updated => {
      devices = updated
    })
  })

  onDestroy(async () => {
    // Stop all active mic monitors when the panel closes
    for (const id of playersStore.monitoringIds) {
      await stopMicMonitor(id).catch(() => {})
      playersStore.setMonitoring(id, false)
      playersStore.setLevel(id, 0)
    }
    unlistenLevel?.()
    unlistenDisconnected?.()
    unlistenReconnected?.()
    unlistenDevices?.()
  })

  async function refreshDevices() {
    devices = await listAudioInputDevices()
  }
</script>

<div class="players-view">
  <div class="view-header">
    <span class="view-title">Players</span>
    <div class="header-actions">
      <button
        class="btn btn-icon"
        title="Refresh mic list"
        aria-label="Refresh microphone list"
        onclick={refreshDevices}
      >
        <span class="icon">refresh</span>
      </button>
      {#if onclose}
        <button class="btn btn-icon" onclick={onclose} aria-label="Close">
          <span class="icon">close</span>
        </button>
      {/if}
    </div>
  </div>

  <div class="cards">
    {#each playersStore.all as player (player.id)}
      <PlayerCard {player} {devices} />
    {/each}
  </div>
</div>

<style>
  .players-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    width: 100%;
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }

  .view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .view-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--md-sys-color-on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
</style>
