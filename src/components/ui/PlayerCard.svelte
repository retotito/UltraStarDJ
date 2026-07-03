<script lang="ts">
  import { playersStore, type PlayerConfig, type MicChannel } from '$lib/stores/players.svelte'
  import type { AudioInputDevice } from '$lib/ipc/tauri'
  import { startMicMonitor, stopMicMonitor } from '$lib/ipc/tauri'
  import Select from '$components/ui/Select.svelte'

  let { player, devices }: { player: PlayerConfig; devices: AudioInputDevice[] } = $props()

  // Exact "deviceId|channel" entries taken by OTHER players
  const takenEntries = $derived(
    new Set(
      playersStore.all
        .filter(p => p.id !== player.id && p.mic?.deviceId)
        .map(p => `${p.mic!.deviceId}|${p.mic!.channel}`)
    )
  )

  const deviceOptions = $derived([
    { value: '', label: '— No mic —' },
    ...devices.flatMap(d => {
      if (d.channels >= 2) {
        const leftKey  = `${d.id}|left`
        const rightKey = `${d.id}|right`
        return [
          { value: leftKey,  label: takenEntries.has(leftKey)  ? `${d.name} — Left (in use)`  : `${d.name} — Left`,  disabled: takenEntries.has(leftKey) },
          { value: rightKey, label: takenEntries.has(rightKey) ? `${d.name} — Right (in use)` : `${d.name} — Right`, disabled: takenEntries.has(rightKey) },
        ]
      }
      const monoKey = `${d.id}|mono`
      return [{ value: monoKey, label: takenEntries.has(monoKey) ? `${d.name} (in use)` : d.name, disabled: takenEntries.has(monoKey) }]
    }),
  ])

  // Encoded select value: "deviceId|channel"
  const micSelectValue = $derived(
    player.mic ? `${player.mic.deviceId}|${player.mic.channel}` : ''
  )


  const COLOR_MAP: Record<string, string> = {
    blue:   'var(--player-1)',
    red:    'var(--player-2)',
    green:  'var(--player-3)',
    yellow: 'var(--player-4)',
  }

  const accent = $derived(COLOR_MAP[player.color] ?? 'var(--player-1)')
  const isMonitoring = $derived(playersStore.monitoringIds.has(player.id))
  const isDisconnected = $derived(playersStore.disconnectedIds.has(player.id))
  const level = $derived(playersStore.levels[player.id] ?? 0)

  // level bar color thresholds
  const barColor = $derived(
    level > 0.85 ? '#f75f5f' :
    level > 0.5  ? '#f7c84f' :
                   accent
  )

  async function toggleMonitor() {
    if (isMonitoring) {
      await stopMicMonitor(player.id)
      playersStore.setMonitoring(player.id, false)
      playersStore.setLevel(player.id, 0)
    } else {
      if (!player.mic) return
      try {
        await startMicMonitor(player.mic.deviceId, player.mic.channel, player.id)
        playersStore.setMonitoring(player.id, true)
        playersStore.setDisconnected(player.id, false)
      } catch (e) {
        console.warn('[PlayerCard] startMicMonitor failed:', e)
      }
    }
  }

  function handleDeviceChange(encoded: string) {
    if (!encoded) {
      playersStore.setMic(player.id, null)
      return
    }
    const sep = encoded.lastIndexOf('|')
    const deviceId = encoded.slice(0, sep)
    const channel = encoded.slice(sep + 1) as MicChannel
    playersStore.setMic(player.id, { deviceId, channel })
  }
</script>

<div class="player-card" class:inactive={!player.active} class:disconnected={isDisconnected}>
  <!-- Header row: toggle + name + color dot -->
  <div class="card-header">
    <label class="toggle-switch" title={player.active ? 'Deactivate player' : 'Activate player'}>
      <input
        type="checkbox"
        checked={player.active}
        onchange={e => playersStore.setActive(player.id, (e.target as HTMLInputElement).checked)}
      />
      <span class="toggle-slider"></span>
    </label>

    <input
      class="name-input"
      type="text"
      value={player.name}
      disabled={!player.active}
      onchange={e => playersStore.setName(player.id, (e.target as HTMLInputElement).value)}
      style="--accent: {accent}"
    />

    <span class="color-dot" style="background: {accent}"></span>
  </div>

  {#if player.active}
    <!-- Mic assignment row -->
    <div class="mic-row">
      <span class="icon mic-icon">mic</span>
      <Select
        value={micSelectValue}
        options={deviceOptions}
        onchange={handleDeviceChange}
        disabled={isMonitoring}
        class="mic-select"
      />
    </div>

    <!-- Test button + disconnected badge -->
    <div class="test-row">
      <button
        class="btn btn-sm"
        class:is-active={isMonitoring}
        disabled={!player.mic}
        onclick={toggleMonitor}
      >
        <span class="icon">{isMonitoring ? 'mic_off' : 'mic'}</span>
        {isMonitoring ? 'Stop test' : 'Test mic'}
      </button>

      {#if isDisconnected}
        <span class="disconnected-badge">
          <span class="icon">cable</span> Disconnected
        </span>
      {/if}
    </div>

    <!-- Level meter -->
    <div class="level-meter" aria-label="Mic level">
      <div
        class="level-fill"
        style="width: {Math.round(level * 100)}%; background: {barColor};"
      ></div>
    </div>
  {/if}
</div>

<style>
  .player-card {
    background: var(--md-sys-color-surface-container);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    transition: opacity var(--transition-fast);
    width: 100%;
  }

  .player-card.inactive {
    opacity: 0.45;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .name-input {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    color: var(--md-sys-color-on-surface);
    font-size: var(--text-sm);
    padding: 2px 4px;
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .name-input:focus {
    border-bottom-color: var(--accent);
  }

  .name-input:disabled {
    cursor: default;
    color: var(--md-sys-color-on-surface-variant);
  }

  .color-dot {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .mic-row {
    position: relative;
    padding-left: 24px;
  }

  .mic-icon {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    font-size: 16px;
    color: var(--md-sys-color-on-surface-variant);
  }

  /* Override Select trigger sizing for the mic row */
  :global(.mic-select) {
    width: 100%;
    height: 32px;
    font-size: var(--text-xs);
  }

  .test-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .btn-sm {
    font-size: var(--text-xs);
    padding: 4px 10px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-sm .icon {
    font-size: 14px;
  }

  .disconnected-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-xs);
    color: #f75f5f;
  }

  .disconnected-badge .icon {
    font-size: 14px;
  }

  /* ── Level meter ── */
  .level-meter {
    height: 10px;
    background: var(--md-sys-color-surface-container-high);
    border-radius: var(--radius-full);
    overflow: hidden;
    margin-top: var(--space-1);
  }

  .level-fill {
    height: 100%;
    border-radius: var(--radius-full);
    transition: width 60ms linear, background 200ms ease;
    min-width: 2px;
  }
</style>
