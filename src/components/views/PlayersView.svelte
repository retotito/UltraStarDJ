<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { playersStore } from '$lib/stores/players.svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import { appSettings } from '$lib/stores/settings.svelte'
  import {
    listAudioInputDevices,
    startMicMonitor,
    stopMicMonitor,
    onDevicesChanged,
    type AudioInputDevice,
  } from '$lib/ipc/tauri'
  import PlayerCard from '$components/ui/PlayerCard.svelte'

  let { onclose }: { onclose?: () => void } = $props()

  let devices = $state<AudioInputDevice[]>([])
  let unlistenDevices: (() => void) | null = null

  onMount(async () => {
    devices = await listAudioInputDevices()

    unlistenDevices = await onDevicesChanged(updated => {
      devices = updated
    })
  })

  onDestroy(async () => {
    unlistenDevices?.()
    // Only stop monitors that were started as test — leave song-driven monitors running
    if (playback.isActive) return
    const activeIds = [...playersStore.monitoringIds]
    for (const id of activeIds) {
      await stopMicMonitor(id).catch(() => {})
      playersStore.setMonitoring(id, false)
      playersStore.setLevel(id, 0)
    }
  })

  let refreshing = $state(false)

  async function refreshDevices() {
    refreshing = true
    const [result] = await Promise.allSettled([
      listAudioInputDevices(),
      new Promise(r => setTimeout(r, 1000)),
    ])
    if (result.status === 'fulfilled') devices = result.value
    refreshing = false
  }
</script>

<div class="players-view">
  <div class="view-header">
    <span class="view-title">Audio Input</span>
    <div class="header-actions">
      <button
        class="btn btn-icon"
        title="Refresh mic list"
        aria-label="Refresh microphone list"
        onclick={refreshDevices}
        disabled={refreshing}
      >
        <span class="icon" class:spinning={refreshing}>refresh</span>
      </button>
      {#if onclose}
        <button class="btn btn-icon" onclick={onclose} aria-label="Close">
          <span class="icon">close</span>
        </button>
      {/if}
    </div>
  </div>

  <div class="cards">
    <!-- Global mic delay row -->
    <div class="delay-row">
      <span class="icon delay-icon">timer</span>
      <span class="delay-label">Mic Delay</span>
      <input
        type="range"
        min="0" max="500" step="10"
        value={appSettings.micDelay}
        oninput={e => appSettings.set('micDelay', Number((e.target as HTMLInputElement).value))}
        class="delay-slider"
        aria-label="Global mic delay"
      />
      <span class="delay-value">{appSettings.micDelay} ms</span>
    </div>

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

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .spinning {
    animation: spin 0.6s linear infinite;
    display: inline-block;
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

  /* ── Global mic delay row ── */
  .delay-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--md-sys-color-surface-container);
    border-radius: var(--radius-lg);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }

  .delay-icon {
    font-size: 18px;
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
  }

  .delay-label {
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    min-width: 68px;
  }

  .delay-slider {
    flex: 1;
    accent-color: var(--md-sys-color-primary);
    height: 4px;
    cursor: pointer;
  }

  .delay-value {
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface);
    font-variant-numeric: tabular-nums;
    min-width: 44px;
    text-align: right;
  }
</style>
