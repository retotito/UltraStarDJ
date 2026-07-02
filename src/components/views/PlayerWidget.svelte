<script lang="ts">
  import { player } from '$lib/stores/player.svelte'
  import { songQueue } from '$lib/stores/queue.svelte'

  function addToQueue() {
    if (player.song) songQueue.add(player.song)
  }
</script>

<div class="player-widget">
  {#if player.song}
    <div class="cover-art">
      <span class="icon icon-lg" style="opacity: 0.4">music_note</span>
    </div>
    <div class="song-info">
      <p class="song-title truncate">{player.song.title}</p>
      <p class="song-artist truncate text-muted text-sm">{player.song.artist}</p>
      {#if player.song.year}
        <p class="text-xs text-muted">{player.song.year} · {player.song.language ?? ''}</p>
      {/if}
    </div>
    <div class="actions">
      <button class="btn btn-ghost" disabled title="Preview available in Sprint 2">
        <span class="icon icon-sm">play_arrow</span>
        Preview
      </button>
      <button class="btn btn-tonal" onclick={addToQueue}>
        <span class="icon icon-sm">queue_music</span>
        Add to Queue
      </button>
    </div>
  {:else}
    <div class="empty-state">
      <p class="text-muted text-sm">Select a song to preview</p>
    </div>
  {/if}
</div>

<style>
  .player-widget {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-4);
    gap: var(--space-3);
  }

  .cover-art {
    width: 100%;
    aspect-ratio: 1;
    max-height: 120px;
    background: var(--md-sys-color-surface-container-highest);
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--md-sys-color-primary);
    flex-shrink: 0;
    --icon-size: 48px;
  }
  .cover-art .icon { font-size: 48px; }

  .song-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .song-title {
    font-weight: var(--font-weight-semibold);
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: auto;
  }

  .actions .btn {
    width: 100%;
    justify-content: center;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
</style>
