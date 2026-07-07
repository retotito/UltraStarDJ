<script lang="ts">
  import SongClock from '$components/ui/SongClock.svelte'

  let {
    currentTime = 0,
    duration = 0,
    playerColor = '#4f8ef7',
    inline = false,
    inactive = false,
  }: {
    currentTime?: number
    duration?: number
    playerColor?: string
    /** Inline layout: [elapsed] [bar] [remaining] in one row */
    inline?: boolean
    /** Show bar in disabled/empty style (no fill, muted colors) */
    inactive?: boolean
  } = $props()

  const elapsed   = $derived(Math.max(0, currentTime))
  const remaining = $derived(Math.max(0, duration - currentTime))
  const pct       = $derived(!inactive && duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0)
</script>

{#if inline}
  <div class="song-progress-inline" class:inactive>
    <div class="clock-pill"><SongClock seconds={elapsed} /></div>
    <div class="bar-track">
      <div class="bar-fill" style="width: {pct}%; background-color: {inactive ? 'transparent' : playerColor};"></div>
    </div>
    <div class="clock-pill"><SongClock seconds={remaining} /></div>
  </div>
{:else}
  <div class="song-progress">
    <div class="times">
      <div class="clock-pill"><SongClock seconds={elapsed} /></div>
      <div class="clock-pill"><SongClock seconds={remaining} /></div>
    </div>
    <div class="bar-track">
      <div class="bar-fill" style="width: {pct}%; background-color: {playerColor};"></div>
    </div>
  </div>
{/if}

<style>
  /* ── Beamer (stacked) variant ── */
  .song-progress {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 var(--space-4) var(--space-3);
    box-sizing: border-box;
  }

  .song-progress .times {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* ── Inline variant ── */
  .song-progress-inline {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: var(--space-2) var(--space-3);
    box-sizing: border-box;
  }

  .song-progress-inline .bar-track {
    flex: 1;
  }

  .song-progress-inline.inactive .clock-pill {
    opacity: 0.4;
  }

  /* ── Shared ── */
  .clock-pill {
    background: var(--progress-pill-bg, rgba(255,255,255,0.1));
    border-radius: 999px;
    padding: 2px 8px;
    line-height: 1.5;
    flex-shrink: 0;
  }

  .song-progress .clock-pill {
    background: var(--progress-pill-bg, rgba(255,255,255,0.15));
    backdrop-filter: blur(4px);
    padding: 2px 10px;
  }

  .bar-track {
    height: 6px;
    background: var(--progress-track-bg, rgba(255,255,255,0.2));
    border-radius: 999px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.25s linear;
  }
</style>

