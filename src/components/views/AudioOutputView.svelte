<script lang="ts">
  import { onMount } from 'svelte'
  import { loadAudioOutputDevices, audioOutputDevices } from '$lib/audio/devices.svelte'
  import { gameChannel, previewChannel } from '$lib/audio/channels.svelte'
  import HorizontalFader from '$components/ui/HorizontalFader.svelte'

  let { onclose }: { onclose?: () => void } = $props()

  onMount(() => { loadAudioOutputDevices() })

  const devices = $derived(audioOutputDevices.list)

  async function setGameDevice(id: string) {
    await gameChannel.setDevice(id || null)
  }

  async function setPreviewDevice(id: string) {
    await previewChannel.setDevice(id || null)
  }
</script>

<div class="audio-output-view">
  <div class="view-header">
    <span class="icon header-icon">speaker</span>
    <h2 class="view-title">Audio Output</h2>
    {#if onclose}
      <button class="btn-close" onclick={onclose} aria-label="Close">
        <span class="icon">close</span>
      </button>
    {/if}
  </div>

  <div class="cards">
    <!-- Game channel card -->
    <div class="output-card">
      <div class="card-header">
        <span class="icon card-icon">music_note</span>
        <span class="card-title">Game</span>
        <span class="card-sub">Beamer / main speakers</span>
      </div>

      <div class="field">
        <label class="field-label">Output device</label>
        <select
          class="device-select"
          value={gameChannel.deviceId ?? ''}
          onchange={(e) => setGameDevice((e.target as HTMLSelectElement).value)}
        >
          <option value="">System default</option>
          {#each devices as d (d.id)}
            <option value={d.id}>{d.name}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label class="field-label">Volume</label>
        <HorizontalFader
          level={gameChannel.level}
          gain={gameChannel.gain}
          ongainchange={(v) => gameChannel.setGain(v)}
        />
      </div>
    </div>

    <!-- Preview channel card -->
    <div class="output-card">
      <div class="card-header">
        <span class="icon card-icon">headphones</span>
        <span class="card-title">Preview</span>
        <span class="card-sub">DJ headphones / monitor</span>
      </div>

      <div class="field">
        <label class="field-label">Output device</label>
        <select
          class="device-select"
          value={previewChannel.deviceId ?? ''}
          onchange={(e) => setPreviewDevice((e.target as HTMLSelectElement).value)}
        >
          <option value="">System default</option>
          {#each devices as d (d.id)}
            <option value={d.id}>{d.name}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label class="field-label">Volume</label>
        <HorizontalFader
          level={previewChannel.level}
          gain={previewChannel.gain}
          ongainchange={(v) => previewChannel.setGain(v)}
        />
      </div>
    </div>
  </div>

  {#if devices.length === 0}
    <p class="no-devices">No output devices found. Using system default.</p>
  {/if}
</div>

<style>
  .audio-output-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    min-width: 320px;
  }

  .view-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    position: relative;
  }

  .header-icon {
    font-size: 22px;
    color: var(--md-sys-color-primary);
  }

  .view-title {
    font-size: var(--text-lg);
    font-weight: 700;
    margin: 0;
    flex: 1;
  }

  .btn-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.5;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }
  .btn-close:hover { opacity: 1; background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }

  .cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .output-card {
    background: color-mix(in srgb, var(--md-sys-color-surface-container) 60%, transparent);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }

  .card-icon {
    font-size: 20px;
    color: var(--md-sys-color-secondary);
  }

  .card-title {
    font-weight: 700;
    font-size: var(--text-base);
  }

  .card-sub {
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
    margin-left: auto;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field-label {
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .device-select {
    width: 100%;
    background: color-mix(in srgb, var(--md-sys-color-surface-container-high) 80%, transparent);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-sm);
    color: var(--md-sys-color-on-surface);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .device-select:focus {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 1px;
  }

  .no-devices {
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;
    opacity: 0.6;
  }
</style>
