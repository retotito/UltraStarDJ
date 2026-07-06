<script lang="ts">
  import { playersStore, type PlayerConfig } from '$lib/stores/players.svelte'
  import HorizontalFader from '$components/ui/HorizontalFader.svelte'

  let { player }: { player: PlayerConfig } = $props()

  const COLOR_MAP: Record<string, string> = {
    blue:   'var(--player-1)',
    red:    'var(--player-2)',
    green:  'var(--player-3)',
    yellow: 'var(--player-4)',
  }

  const accent = $derived(COLOR_MAP[player.color] ?? 'var(--player-1)')
  const isMuted = $derived(playersStore.mutedIds.has(player.id))
  const level = $derived(isMuted ? 0 : Math.min(1, playersStore.levels[player.id] ?? 0))
</script>

<div class="mic-mix-row">
  <div class="row-header">
    <span class="color-dot" style="background: {accent}"></span>
    <span class="player-name">{player.name}</span>
    <button
      class="btn btn-icon btn-sm mute-btn"
      class:is-muted={isMuted}
      title={isMuted ? 'Unmute' : 'Mute'}
      aria-label={isMuted ? `Unmute ${player.name}` : `Mute ${player.name}`}
      onclick={() => playersStore.toggleMute(player.id)}
    >
      <span class="icon">{isMuted ? 'mic_off' : 'mic'}</span>
    </button>
  </div>

  <HorizontalFader
    label=""
    level={level}
    gain={isMuted ? 0 : player.mixGain}
    ongainchange={(v) => playersStore.setMixGain(player.id, v)}
    color={accent}
    dimmed={isMuted}
  />
</div>

<style>
  .mic-mix-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .row-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .player-name {
    flex: 1;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--md-sys-color-on-surface);
  }

  .mute-btn {
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.7;
  }

  .mute-btn.is-muted {
    color: var(--md-sys-color-error);
    opacity: 1;
  }
</style>
