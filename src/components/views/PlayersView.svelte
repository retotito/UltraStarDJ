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
      playersStore.setDisconnected(e.player_id, true)
      playersStore.setMonitoring(e.player_id, false)
      playersStore.setLevel(e.player_id, 0)
      // Stop the dead stream on Rust side
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

  onDestroy(() => {
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
    <button
      class="btn btn-icon"
      title="Refresh mic list"
      aria-label="Refresh microphone list"
      onclick={refreshDevices}
    >
      <span class="icon">refresh</span>
    </button>
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
    width: 280px;
  }

  .view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
  }
</style>
