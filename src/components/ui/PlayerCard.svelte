<script lang="ts">
  import { playersStore, type PlayerConfig, type MicChannel } from '$lib/stores/players.svelte'
  import type { AudioInputDevice } from '$lib/ipc/tauri'
  import { startMicMonitor, stopMicMonitor } from '$lib/ipc/tauri'
  import Select from '$components/ui/Select.svelte'
  import MicLevelMeter from '$components/ui/MicLevelMeter.svelte'

  let { player, devices }: { player: PlayerConfig; devices: AudioInputDevice[] } = $props()

  // Exact "deviceId|channel" entries taken by OTHER active players, with player info
  const takenByMap = $derived(
    new Map(
      playersStore.all
        .filter(p => p.id !== player.id && p.mic?.deviceId)
        .map(p => [`${p.mic!.deviceId}|${p.mic!.channel}`, p])
    )
  )

  const deviceOptions = $derived([
    { value: '', label: '— No mic —' },
    ...devices.flatMap(d => {
      if (d.channels >= 2) {
        const leftKey  = `${d.id}|left`
        const rightKey = `${d.id}|right`
        const leftOwner  = takenByMap.get(leftKey)
        const rightOwner = takenByMap.get(rightKey)
        return [
          { value: leftKey,  label: `${d.name} — Left`,  disabled: !!leftOwner,  takenBy: leftOwner  ? { label: `P${leftOwner.id}`, color: leftOwner.color }  : undefined },
          { value: rightKey, label: `${d.name} — Right`, disabled: !!rightOwner, takenBy: rightOwner ? { label: `P${rightOwner.id}`, color: rightOwner.color } : undefined },
        ]
      }
      const monoKey = `${d.id}|mono`
      const monoOwner = takenByMap.get(monoKey)
      return [{ value: monoKey, label: d.name, disabled: !!monoOwner, takenBy: monoOwner ? { label: `P${monoOwner.id}`, color: monoOwner.color } : undefined }]
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
  const level = $derived(Math.min(1, (playersStore.levels[player.id] ?? 0) * player.gain))

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
        onchange={async e => {
          const active = (e.target as HTMLInputElement).checked
          if (!active && isMonitoring) {
            await stopMicMonitor(player.id).catch(() => {})
            playersStore.setMonitoring(player.id, false)
            playersStore.setLevel(player.id, 0)
          }
          playersStore.setActive(player.id, active)
        }}
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
        class:btn-danger={isMonitoring}
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
    <MicLevelMeter {level} />

    <!-- Gain slider -->
    <div class="gain-row">
      <span class="icon gain-icon">tune</span>
      <input
        type="range"
        class="gain-slider"
        min="0"
        max="2"
        step="0.05"
        value={player.gain}
        oninput={e => playersStore.setGain(player.id, parseFloat((e.target as HTMLInputElement).value))}
        aria-label="Mic gain"
      />
      <span class="gain-value">{Math.round(player.gain * 100)}%</span>
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

  /* ── Gain slider ── */
  .gain-row {
    position: relative;
    padding-left: 24px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .gain-icon {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    font-size: 16px;
    color: var(--md-sys-color-on-surface-variant);
  }

  .gain-slider {
    flex: 1;
    height: 4px;
    accent-color: var(--md-sys-color-primary);
    cursor: pointer;
  }

  .gain-value {
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
    width: 36px;
    text-align: right;
    flex-shrink: 0;
  }
</style>
