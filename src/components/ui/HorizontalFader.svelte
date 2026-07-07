<script lang="ts">
  /**
   * HorizontalFader — combined level meter + draggable gain fader.
   *
   * The meter shows live signal level (0–1) behind the fader knob.
   * The knob sits on top and can be dragged left/right to set gain.
   * Double-click knob to reset to unity (1.0).
   *
   * Props:
   *   label       — channel name shown on the left
   *   level       — live meter reading 0–1 (driven by AnalyserNode or similar)
   *   gain        — current fader value 0–1 (bindable via ongainchange)
   *   ongainchange — called when user drags the fader
   *   icon        — material icon name (default: "volume_up")
   *   color       — accent color for the knob (default: primary token)
   */

  let {
    label      = '',
    level      = 0,
    gain       = 1,
    maxGain    = 1,
    threshold  = 0,
    ongainchange = (_: number) => {},
    color      = 'var(--md-sys-color-primary)',
    dimmed     = false,
  }: {
    label?:        string
    level?:        number
    gain?:         number
    maxGain?:      number
    threshold?:    number
    ongainchange?: (v: number) => void
    color?:        string
    dimmed?:       boolean
  } = $props()

  // ── Segments ──────────────────────────────────────────────
  const TOTAL        = 30
  const YELLOW_START = 20   // top 33% = yellow
  const RED_START    = 26   // top 13% = red

  const segments = $derived(
    Array.from({ length: TOTAL }, (_, i) => {
      const lit = i < Math.round(level * TOTAL)
      const color =
        i >= RED_START    ? 'red'    :
        i >= YELLOW_START ? 'yellow' :
                            'green'
      return { lit, color }
    })
  )

  // ── Drag logic ────────────────────────────────────────────
  let trackEl: HTMLDivElement | undefined
  let dragging = false

  function gainFromPointer(clientX: number): number {
    if (!trackEl) return gain
    const rect = trackEl.getBoundingClientRect()
    return Math.max(0, Math.min(maxGain, (clientX - rect.left) / rect.width * maxGain))
  }

  function onKnobPointerDown(e: PointerEvent) {
    e.preventDefault()
    dragging = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onKnobPointerMove(e: PointerEvent) {
    if (!dragging) return
    ongainchange(gainFromPointer(e.clientX))
  }

  function onKnobPointerUp(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  function onTrackClick(e: MouseEvent) {
    // Only jump when clicking the track itself, not the knob
    if ((e.target as HTMLElement).closest('.knob')) return
    ongainchange(gainFromPointer(e.clientX))
  }

  function onKnobDblClick() {
    ongainchange(1)
  }

  const gainPct = $derived(`${(gain / maxGain * 100).toFixed(0)}%`)
  const gainLabel = $derived(`${Math.round(gain * 100)}%`)
</script>

<div class="fader-row">
  <!-- Label -->
  {#if label}
    <span class="label">{label}</span>
  {/if}

  <!-- Track: meter segments + knob overlay -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="track" bind:this={trackEl} onclick={onTrackClick} role="presentation">
    <!-- Meter segments -->
    <div class="segments" class:segments--dimmed={dimmed}>
      {#each segments as seg}
        <div class="seg seg-{seg.color}" class:lit={seg.lit}></div>
      {/each}
    </div>

    <!-- Threshold: dim everything to the right of the knob -->
    {#if threshold > 0 && threshold < maxGain}
      <div class="threshold-dim" style="left: {threshold / maxGain * 100}%"></div>
    {/if}

    <!-- Fader knob -->
    <div
      class="knob"
      class:dragging
      style="left: {gain / maxGain * 100}%; --knob-color: {color};"
      role="slider"
      aria-label="{label} gain"
      aria-valuenow={Math.round(gain * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabindex="0"
      ondblclick={onKnobDblClick}
      onpointerdown={onKnobPointerDown}
      onpointermove={onKnobPointerMove}
      onpointerup={onKnobPointerUp}
    ></div>
  </div>

  <!-- Readout: value only -->
  <div class="readout">
    <span class="value">{gainLabel}</span>
  </div>
</div>

<style>
  .fader-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 28px;
    user-select: none;
  }

  .fader-row.is-dimmed {
    opacity: 0.35;
    pointer-events: none;
  }

  .segments--dimmed .seg { opacity: 0.25; }

  .label {
    min-width: 72px;
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Track ── */
  .track {
    flex: 1;
    position: relative;
    height: 18px;
    cursor: pointer;
    border-radius: 4px;
    overflow: visible;
  }

  /* ── Meter segments ── */
  .segments {
    position: absolute;
    inset: 4px 0;
    display: flex;
    gap: 2px;
    border-radius: 3px;
    overflow: hidden;
  }

  .seg {
    flex: 1;
    transition: background 60ms linear, box-shadow 60ms linear;
  }

  /* unlit */
  .seg-green  { background: #1a3d1a; }
  .seg-yellow { background: #3d3010; }
  .seg-red    { background: #3d1010; }

  /* lit */
  .seg-green.lit  { background: #4ecb71; box-shadow: 0 0 3px #4ecb7166; }
  .seg-yellow.lit { background: #f7c84f; box-shadow: 0 0 3px #f7c84f66; }
  .seg-red.lit    { background: #f75f5f; box-shadow: 0 0 3px #f75f5f66; }

  /* ── Threshold dim overlay ── */
  .threshold-dim {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.55);
    border-radius: 0 3px 3px 0;
    pointer-events: none;
    z-index: 2;
  }

  /* ── Knob ── */
  .knob {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 12px;
    height: 28px;
    border-radius: 4px;
    background: var(--knob-color, var(--md-sys-color-primary));
    box-shadow: 0 1px 4px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15);
    cursor: grab;
    transition: box-shadow 0.1s, transform 0.05s;
    z-index: 1;
  }

  .knob::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 10px;
    border-radius: 1px;
    background: rgba(255,255,255,0.35);
  }

  .knob:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.7), 0 0 0 2px color-mix(in srgb, var(--knob-color, var(--md-sys-color-primary)) 40%, transparent);
  }

  .knob.dragging {
    cursor: grabbing;
    transform: translate(-50%, -50%) scale(1.1);
    box-shadow: 0 3px 12px rgba(0,0,0,0.8), 0 0 0 3px color-mix(in srgb, var(--knob-color, var(--md-sys-color-primary)) 50%, transparent);
  }

  /* ── Readout ── */
  .readout {
    display: flex;
    align-items: center;
    min-width: 36px;
    color: var(--md-sys-color-on-surface-variant);
  }

  .readout .value {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    min-width: 32px;
    text-align: right;
  }
</style>
