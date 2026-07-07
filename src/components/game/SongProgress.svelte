<script lang="ts">
  import SongClock from '$components/ui/SongClock.svelte'

  let {
    currentTime = 0,
    duration = 0,
    playerColor = '#4f8ef7',
  }: {
    currentTime?: number
    duration?: number
    playerColor?: string
  } = $props()

  const elapsed   = $derived(Math.max(0, currentTime))
  const remaining = $derived(Math.max(0, duration - currentTime))
  const pct       = $derived(duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0)
</script>

<div class="song-progress">
  <div class="times">
    <div class="clock-pill"><SongClock seconds={elapsed} /></div>
    <div class="clock-pill"><SongClock seconds={remaining} showSign={false} /></div>
  </div>
  <div class="bar-track">
    <div class="bar-fill" style="width: {pct}%; background-color: {playerColor};"></div>
  </div>
</div>

<style>
  .song-progress {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 var(--space-4) var(--space-3);
    box-sizing: border-box;
  }

  .times {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .clock-pill {
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(4px);
    border-radius: 999px;
    padding: 2px 10px;
    line-height: 1.5;
  }

  .bar-track {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.25s linear;
  }
</style>
