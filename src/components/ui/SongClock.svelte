<script lang="ts">
  let { seconds, showSign = false }: { seconds: number; showSign?: boolean } = $props()

  const formatted = $derived.by(() => {
    const abs = Math.abs(seconds)
    const m = Math.floor(abs / 60)
    const s = Math.floor(abs % 60)
    const sign = showSign && seconds < 0 ? '-' : ''
    return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })
</script>

<span class="song-clock">{formatted}</span>

<style>
  .song-clock {
    font-variant-numeric: tabular-nums;
    font-size: var(--text-sm, 0.85rem);
    font-weight: 600;
    letter-spacing: 0.03em;
    color: rgba(255, 255, 255, 0.85);
  }
</style>
