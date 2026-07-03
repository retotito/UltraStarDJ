<script lang="ts">
  let { level = 0 }: { level: number } = $props()

  // 20 segments total: 0-12 green, 13-16 yellow, 17-19 red
  const TOTAL = 20
  const YELLOW_START = 13
  const RED_START    = 17

  const segments = $derived(
    Array.from({ length: TOTAL }, (_, i) => {
      const lit = i < Math.round(level * TOTAL)
      const color =
        i >= RED_START    ? 'red' :
        i >= YELLOW_START ? 'yellow' :
                            'green'
      return { lit, color }
    })
  )
</script>

<div class="meter" aria-label="Mic level" role="meter" aria-valuenow={Math.round(level * 100)}>
  {#each segments as seg}
    <div class="seg seg-{seg.color}" class:lit={seg.lit}></div>
  {/each}
</div>

<style>
  .meter {
    display: flex;
    flex-direction: row;
    gap: 2px;
    width: 100%;
    height: 10px;
  }

  .seg {
    flex: 1;
    border-radius: 2px;
    transition: background 60ms linear, box-shadow 60ms linear;
  }

  /* unlit — dim */
  .seg-green  { background: #1a3d1a; }
  .seg-yellow { background: #3d3010; }
  .seg-red    { background: #3d1010; }

  /* lit */
  .seg-green.lit  { background: #4ecb71; box-shadow: 0 0 4px #4ecb7188; }
  .seg-yellow.lit { background: #f7c84f; box-shadow: 0 0 4px #f7c84f88; }
  .seg-red.lit    { background: #f75f5f; box-shadow: 0 0 4px #f75f5f88; }
</style>
