<script lang="ts">
  import PlayerWidget from '$components/views/PlayerWidget.svelte'
  import QueueWidget from '$components/views/QueueWidget.svelte'
</script>

<div class="right-panel">
  <div class="player-area">
    <div class="widget-label">Preview Player</div>
    <PlayerWidget />
  </div>
  <div class="queue-area">
    <QueueWidget />
  </div>
</div>

<style>
  .right-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--md-sys-color-surface);
    overflow: hidden;
  }

  .player-area {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .queue-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .widget-label {
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--md-sys-color-on-surface-variant);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }
</style>
