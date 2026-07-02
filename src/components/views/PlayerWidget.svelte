<script lang="ts">
  import '@material/web/button/filled-tonal-button.js'
  import '@material/web/button/text-button.js'
  import '@material/web/icon/icon.js'
  import { player } from '$lib/stores/player.svelte'
  import { songQueue } from '$lib/stores/queue.svelte'

  function addToQueue() {
    if (player.song) songQueue.add(player.song)
  }
</script>

<div class="player-widget">
  {#if player.song}
    <div class="cover-art">
      <md-icon>music_note</md-icon>
    </div>
    <div class="song-info">
      <p class="song-title truncate">{player.song.title}</p>
      <p class="song-artist truncate text-muted text-sm">{player.song.artist}</p>
      {#if player.song.year}
        <p class="text-xs text-muted">{player.song.year} · {player.song.language ?? ''}</p>
      {/if}
    </div>
    <div class="actions">
      <md-text-button disabled title="Preview available in Sprint 2">
        <md-icon slot="icon">play_arrow</md-icon>
        Preview
      </md-text-button>
      <md-filled-tonal-button onclick={addToQueue}>
        <md-icon slot="icon">queue_music</md-icon>
        Add to Queue
      </md-filled-tonal-button>
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
    /* Token overrides for buttons */
    --md-filled-tonal-button-container-color: var(--md-sys-color-primary-container);
    --md-filled-tonal-button-label-text-color: var(--md-sys-color-on-primary-container);
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
    --md-icon-size: 48px;
    opacity: 0.5;
  }

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

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
</style>
