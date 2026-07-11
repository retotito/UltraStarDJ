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
    maxThreshold = 0.5,
    showThreshold = false,
    onthresholdchange = (_: number) => {},
    ongainchange = (_: number) => {},
    color      = 'var(--md-sys-color-primary)',
    dimmed     = false,
    showDb     = false,
  }: {
    label?:             string
    level?:             number
    gain?:              number
    maxGain?:           number
    threshold?:         number
    maxThreshold?:      number
    showThreshold?:     boolean
    onthresholdchange?: (v: number) => void
    ongainchange?:      (v: number) => void
    color?:             string
    dimmed?:            boolean
    showDb?:            boolean
  } = $props()

  // ── Segments ──────────────────────────────────────────────
  const TOTAL        = 30
  const YELLOW_START = 20   // top 33% = yellow
  const RED_START    = 26   // top 13% = red

  // SongFader: linear meter with 1.44× boost so typical signal levels hit red
  const displayLevel = $derived(Math.min(1, level * 1.44))

  // Linear threshold display
  function ampToDisplayPos(amp: number): number {
    return Math.min(1, Math.max(0, amp))
  }

  function displayPosToAmp(pos: number): number {
    return Math.min(1, Math.max(0, pos))
  }

  // Linear fader: position 1:1 with gain / maxGain
  function gainToPos(g: number): number {
    return Math.min(1, Math.max(0, g / maxGain))
  }

  function posToGain(pos: number): number {
    return Math.min(maxGain, Math.max(0, pos * maxGain))
  }

  const segments = $derived(
    Array.from({ length: TOTAL }, (_, i) => {
      const lit = i < Math.round(displayLevel * TOTAL)
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
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return posToGain(fraction)
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

  // ── Threshold handle drag ─────────────────────────────────
  let thresholdDragging = false

  function thresholdFromPointer(clientX: number): number {
    if (!trackEl) return threshold
    const rect = trackEl.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.min(maxThreshold, displayPosToAmp(fraction))
  }

  function onThresholdPointerDown(e: PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    thresholdDragging = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onThresholdPointerMove(e: PointerEvent) {
    if (!thresholdDragging) return
    onthresholdchange(thresholdFromPointer(e.clientX))
  }

  function onThresholdPointerUp(e: PointerEvent) {
    if (!thresholdDragging) return
    thresholdDragging = false
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  const gainPct = $derived(`${(gain / maxGain * 100).toFixed(0)}%`)
  const gainLabel = $derived(
    showDb
      ? (gain <= 0 ? '-∞ dB' : `${(20 * Math.log10(gain)).toFixed(1)} dB`)
      : `${Math.round(gain / maxGain * 100)}%`
  )
</script>

<div class="fader-row">
  <!-- Label -->
  {#if label}
    <span class="label">{label}</span>
  {/if}

  <!-- Track: meter segments + knob overlay -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="track-wrap">
    <div class="track" bind:this={trackEl} onclick={onTrackClick} role="presentation">
      <!-- Meter segments -->
      <div class="segments" class:segments--dimmed={dimmed}>
        {#each segments as seg}
          <div class="seg seg-{seg.color}" class:lit={seg.lit}></div>
        {/each}
      </div>

      <!-- Threshold: dim LEFT side (below threshold = blocked noise) -->
      {#if threshold > 0}
        <div class="threshold-dim" style="width: {ampToDisplayPos(threshold) * 100}%"></div>
      {/if}

      <!-- Fader knob -->
      <div
        class="knob"
        class:dragging
        style="left: {gainToPos(gain) * 100}%; --knob-color: {color};"
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

    <!-- Threshold handle: sits below the track, draggable -->
    {#if showThreshold}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="threshold-handle"
        class:threshold-dragging={thresholdDragging}
        style="left: {ampToDisplayPos(threshold) * 100}%"
        title="Noise gate threshold"
        onpointerdown={onThresholdPointerDown}
        onpointermove={onThresholdPointerMove}
        onpointerup={onThresholdPointerUp}
      ></div>
    {/if}
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
    height: 36px;
    user-select: none;
    width: 100%;
    min-width: 0;
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

  /* ── Track wrap (holds track + threshold handle) ── */
  .track-wrap {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  /* ── Track ── */
  .track {
    width: 100%;
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

  /* ── Threshold dim overlay (LEFT = blocked zone) ── */
  .threshold-dim {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background: rgba(220, 60, 60, 0.28);
    border-radius: 3px 0 0 3px;
    pointer-events: none;
    z-index: 2;
  }

  /* ── Threshold handle (below track) ── */
  .threshold-handle {
    position: absolute;
    top: 20px;
    transform: translateX(-50%);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #f75f5f;
    border: 2px solid rgba(255,255,255,0.6);
    cursor: ew-resize;
    z-index: 3;
    box-shadow: 0 1px 3px rgba(0,0,0,0.6);
    transition: transform 0.08s;
  }

  .threshold-handle:hover,
  .threshold-handle.threshold-dragging {
    transform: translateX(-50%) scale(1.3);
    box-shadow: 0 0 0 3px rgba(247, 95, 95, 0.35);
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
