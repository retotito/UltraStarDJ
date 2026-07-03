<script lang="ts">
  import type { PlaySongPayload } from '$lib/ultrastar/types'

  let { payload, assignedPlayerIds = [] }: {
    payload: PlaySongPayload | null
    assignedPlayerIds?: number[]
  } = $props()

  const PLAYER_COLORS: Record<number, string> = {
    1: '#4f8ef7',
    2: '#f75f5f',
    3: '#4ecb71',
    4: '#f7c84f',
  }
</script>

<div class="beamer-view">
  {#if payload}
    <p class="text-lg font-semibold">{payload.song.artist} — {payload.song.title}</p>
    <p class="text-muted text-sm">Playback coming in Sprint 6</p>
  {:else}
    <div class="idle-screen">
      <span class="logo-text">UltrastarDJ</span>

      {#if assignedPlayerIds.length > 0}
        <div class="player-badges">
          {#each assignedPlayerIds as id}
            <div class="player-badge" style="border-color: {PLAYER_COLORS[id] ?? '#888'}; color: {PLAYER_COLORS[id] ?? '#888'}">
              P{id}
            </div>
          {/each}
        </div>
      {:else}
        <span class="waiting">No players assigned</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .beamer-view {
    width: 100vw;
    height: 100vh;
    background: #000;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
  }

  .idle-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
  }

  .logo-text {
    font-size: 3rem;
    font-weight: var(--font-weight-bold);
    color: var(--md-sys-color-primary);
    letter-spacing: 0.05em;
  }

  .player-badges {
    display: flex;
    gap: var(--space-4);
  }

  .player-badge {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: 3px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .waiting {
    color: rgba(255, 255, 255, 0.4);
    font-size: 1rem;
  }
</style>
