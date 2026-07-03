<script lang="ts">
  import { songQueue } from '$lib/stores/queue.svelte'
  import { playback } from '$lib/stores/playback.svelte'

  async function playSong(songId: string) {
    const song = songQueue.items.find(s => s.id === songId)
    if (!song) return
    songQueue.setActive(songId)
    await playback.play(song)
  }
</script>

<div class="queue-view">
  <div class="view-header">
    <span class="view-title">Queue</span>
    {#if songQueue.items.length > 0}
      <button class="btn btn-sm btn-ghost" onclick={() => songQueue.clear()}>Clear</button>
    {/if}
  </div>

  {#if songQueue.items.length === 0}
    <div class="empty-state">
      <span class="icon empty-icon">queue_music</span>
      <p class="text-muted">Queue is empty</p>
      <p class="text-muted text-sm">Add songs from the library</p>
    </div>
  {:else}
    <div class="queue-list">
      {#each songQueue.items as song, i (song.id)}
        <div class="queue-row" class:is-active={songQueue.activeIndex === i}>
          <span class="row-index text-muted">{i + 1}</span>
          <div class="row-info">
            <span class="row-title">{song.title}</span>
            <span class="row-artist text-muted text-sm">{song.artist}</span>
          </div>
          <div class="row-actions">
            <button
              class="btn btn-icon btn-sm"
              disabled={playback.isActive}
              title={playback.isActive ? 'Stop current song first' : 'Play'}
              onclick={() => playSong(song.id)}
            >
              <span class="icon">play_arrow</span>
            </button>
            <button
              class="btn btn-icon btn-sm"
              disabled={playback.isActive && songQueue.activeIndex === i}
              title="Remove from queue"
              onclick={() => songQueue.remove(song.id)}
            >
              <span class="icon">delete</span>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .queue-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }

  .view-title {
    font-size: var(--text-base);
    font-weight: 600;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    color: var(--md-sys-color-on-surface-variant);
  }

  .empty-icon {
    font-size: 48px;
    opacity: 0.4;
  }

  .queue-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) 0;
  }

  .queue-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    margin: 0 var(--space-2);
    transition: background var(--transition-fast);
  }

  .queue-row:hover {
    background: var(--md-sys-color-surface-container-high);
  }

  .queue-row.is-active {
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }

  .row-index {
    width: 20px;
    text-align: right;
    font-size: var(--text-sm);
    flex-shrink: 0;
  }

  .row-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row-title {
    font-size: var(--text-sm);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-artist {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-actions {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }
</style>
