<script lang="ts">
  import { playersStore, type PlayerConfig, type MicChannel } from '$lib/stores/players.svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import type { AudioInputDevice } from '$lib/ipc/tauri'
  import { startMicMonitor, stopMicMonitor, openMicMixChannel, closeMicMixChannel } from '$lib/ipc/tauri'
  import Select from '$components/ui/Select.svelte'
  import HorizontalFader from '$components/ui/HorizontalFader.svelte'

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
  const level = $derived(playersStore.levels[player.id] ?? 0)

  // Restart the Rust stream after the Gain slider settles (500ms debounce)
  let gainRestartTimer: ReturnType<typeof setTimeout> | null = null
  function onGainChange(v: number) {
    playersStore.setInputGain(player.id, v)
    if (!isMonitoring || !player.mic) return
    if (gainRestartTimer) clearTimeout(gainRestartTimer)
    gainRestartTimer = setTimeout(async () => {
      await stopMicMonitor(player.id).catch(() => {})
      // threshold=0 during test — gate bypassed so audio flows continuously
      await startMicMonitor(player.mic!.deviceId, player.mic!.channel, player.id, 0, v).catch(() => {})
    }, 500)
  }

  async function toggleMonitor() {
    if (isMonitoring) {
      await stopMicMonitor(player.id)
      playersStore.setMonitoring(player.id, false)
      playersStore.setLevel(player.id, 0)
      // Close mic-mix channel if no other players are monitoring
      if (playersStore.monitoringIds.size === 0 && !playback.isActive) {
        await closeMicMixChannel().catch(() => {})
      }
    } else {
      if (!player.mic) return
      try {
        await openMicMixChannel().catch(e => console.warn('[PlayerCard] openMicMixChannel:', e))
        // threshold=0 during test — gate bypassed so audio flows continuously
        await startMicMonitor(player.mic.deviceId, player.mic.channel, player.id, 0, player.inputGain ?? 1.0)
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

<div class="player-card"
  class:status-active={playersStore.isActive(player.id)}
  class:status-no-mic={!player.mic && !isDisconnected}
  class:disconnected={isDisconnected}
>
  <!-- Header row: name + color dot -->
  <div class="card-header">
    <input
      class="name-input"
      type="text"
      value={player.name}
      onchange={e => playersStore.setName(player.id, (e.target as HTMLInputElement).value)}
      style="--accent: {accent}"
    />

    <span class="color-dot" style="background: {accent}"></span>
  </div>

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
    {#if player.mic}
    <div class="test-row">
      <button
        class="btn btn-lg"
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

    <!-- Combined Gain + Gate fader -->
    <HorizontalFader
      label="Gain"
      level={level}
      gain={player.inputGain}
      threshold={player.threshold}
      maxThreshold={0.5}
      showThreshold={true}
      showDb={false}
      color={accent}
      ongainchange={onGainChange}
      onthresholdchange={(v) => playersStore.setThreshold(player.id, v)}
    />

    <!-- Monitor output: hear the mic while adjusting gain/gate -->
    {#if isMonitoring}
      {@const isMuted = playersStore.mutedIds.has(player.id)}
      <div class="monitor-row">
        <button
          class="btn btn-icon mute-btn"
          class:is-muted={isMuted}
          title={isMuted ? 'Unmute monitor' : 'Mute monitor'}
          aria-label={isMuted ? 'Unmute monitor' : 'Mute monitor'}
          onclick={() => playersStore.toggleMute(player.id)}
        >
          <span class="icon">{isMuted ? 'volume_off' : 'volume_up'}</span>
        </button>
        <HorizontalFader
          label="Output"
          level={isMuted ? 0 : Math.min(1, level * player.mixGain)}
          gain={isMuted ? 0 : player.mixGain}
          ongainchange={(v) => playersStore.setMixGain(player.id, v)}
          color={accent}
          dimmed={isMuted}
        />
      </div>
    {/if}
    {/if}
</div>

<style>
  .player-card {
    background: var(--md-sys-color-surface-container);
    border-radius: var(--radius-lg);
    border-left: 3px solid transparent;
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    transition: border-color var(--transition-fast);
    width: 100%;
  }

  .player-card.status-active {
    border-left-color: #4ecb71;
  }

  .player-card.status-no-mic {
    border-left-color: color-mix(in srgb, #f5a623 70%, transparent);
  }

  .player-card.disconnected {
    border-left-color: color-mix(in srgb, #f75f5f 70%, transparent);
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

  .monitor-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-top: var(--space-1);
    border-top: 1px solid var(--md-sys-color-outline-variant);
    width: 100%;
    min-width: 0;
  }

  .monitor-row :global(.fader-row) {
    flex: 1;
    min-width: 0;
  }

  .mute-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--md-sys-color-on-surface-variant);
  }

  .mute-btn.is-muted {
    color: #f75f5f;
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
</style>
