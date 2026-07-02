<script lang="ts">
  import '@material/web/iconbutton/icon-button.js'
  import '@material/web/icon/icon.js'
  import '@material/web/button/filled-button.js'
  import '@material/web/button/text-button.js'
  import { songQueue } from '$lib/stores/queue.svelte'
  import { sendPlaySong } from '$lib/ipc/tauri'

  async function startNext() {
    const song = songQueue.activeSong ?? songQueue.items[0]
    if (!song) return
    songQueue.setActive(song.id)
    await sendPlaySong({ song, assetBase: 'asset://localhost/' })
  }
</script>

<div class="queue-widget">
  <header class="queue-header">
    <span class="queue-label">Queue ({songQueue.items.length})</span>
    {#if songQueue.items.length > 0}
      <md-text-button onclick={() => songQueue.clear()}>Clear</md-text-button>
    {/if}
  </header>

  <div class="queue-list">
    {#if songQueue.items.length === 0}
      <div class="empty-queue">
        <p class="text-muted text-xs">No songs queued yet</p>
        <p class="text-muted text-xs">Right-click a song → Add to queue</p>
      </div>
    {:else}
      {#each songQueue.items as song, i (song.id)}
        <div class="queue-row" class:active={songQueue.activeSong?.id === song.id}>
          <span class="q-num text-muted text-xs">{i + 1}</span>
          <div class="q-info min-w-0">
            <p class="truncate text-sm">{song.title}</p>
            <p class="truncate text-xs text-muted">{song.artist}</p>
          </div>
          <div class="q-actions">
            <md-icon-button
              onclick={() => songQueue.moveUp(song.id)}
              disabled={i === 0}
              aria-label="Move up"
            >
              <md-icon>keyboard_arrow_up</md-icon>
            </md-icon-button>
            <md-icon-button
              onclick={() => songQueue.moveDown(song.id)}
              disabled={i === songQueue.items.length - 1}
              aria-label="Move down"
            >
              <md-icon>keyboard_arrow_down</md-icon>
            </md-icon-button>
            <md-icon-button
              onclick={() => songQueue.remove(song.id)}
              aria-label="Remove"
            >
              <md-icon>close</md-icon>
            </md-icon-button>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  {#if songQueue.items.length > 0}
    <div class="queue-footer">
      <md-filled-button onclick={startNext} style="width: 100%">
        <md-icon slot="icon">play_arrow</md-icon>
        Start next song
      </md-filled-button>
    </div>
  {/if}
</div>

<style>
  .queue-widget {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    /* token overrides */
    --md-icon-button-icon-size: 18px;
    --md-icon-button-icon-color: var(--md-sys-color-on-surface-variant);
    --md-text-button-label-text-color: var(--md-sys-color-primary);
  }

  .queue-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }

  .queue-label {
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--md-sys-color-on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .queue-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-1) 0;
  }

  .empty-queue {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--space-1);
    padding: var(--space-6);
    text-align: center;
  }

  .queue-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }
  .queue-row:hover { background: var(--color-table-row-hover); }
  .queue-row.active { background: var(--color-table-row-selected); }

  .q-num {
    width: 16px;
    text-align: right;
    flex-shrink: 0;
  }

  .q-info {
    flex: 1;
    min-width: 0;
  }

  .q-actions {
    display: flex;
    gap: 0;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }
  .queue-row:hover .q-actions { opacity: 1; }

  .queue-footer {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }
</style>
