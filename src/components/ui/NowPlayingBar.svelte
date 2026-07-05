<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import { displaysStore } from '$lib/stores/displays.svelte'
  import { layout } from '$lib/stores/layout.svelte'
  import HorizontalFader from '$components/ui/HorizontalFader.svelte'
  import { gameChannel } from '$lib/audio/channels.svelte'

  const PLAYER_COLORS: Record<number, string> = {
    1: 'var(--player-1)',
    2: 'var(--player-2)',
    3: 'var(--player-3)',
    4: 'var(--player-4)',
  }

  const allPlayerIds = $derived(
    [...new Set([...displaysStore.display1.playerIds, ...displaysStore.display2.playerIds])].sort((a, b) => a - b)
  )

  const hasDisplay = $derived(displaysStore.display1.open || displaysStore.display2.open)

  // Dragging state — null = CSS default (bottom-center)
  let x = $state<number | null>(null)
  let y = $state<number | null>(null)
  let dragging = $state(false)
  let dragStartX = 0
  let dragStartY = 0
  let cardEl: HTMLDivElement | undefined

  function clamp() {
    if (x === null || y === null || !cardEl) return
    x = Math.max(0, Math.min(x, window.innerWidth  - cardEl.offsetWidth))
    y = Math.max(0, Math.min(y, window.innerHeight - cardEl.offsetHeight))
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    const tenth = Math.floor((s % 1) * 10)
    return `${m}:${String(sec).padStart(2, '0')}.${tenth}`
  }

  function onDragStart(e: MouseEvent) {
    if (!cardEl) return
    if (x === null) {
      const rect = cardEl.getBoundingClientRect()
      x = rect.left
      y = rect.top
    }
    dragging = true
    dragStartX = e.clientX - x
    dragStartY = e.clientY - (y ?? 0)
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragEnd)
  }

  function onDragMove(e: MouseEvent) {
    if (!dragging || !cardEl || x === null || y === null) return
    x = e.clientX - dragStartX
    y = e.clientY - dragStartY
    clamp()
  }

  function onDragEnd() {
    dragging = false
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)
  }

  onMount(() => window.addEventListener('resize', clamp))
  onDestroy(() => window.removeEventListener('resize', clamp))
</script>

{#if layout.showNowPlaying}
  <div
    class="now-playing-card"
    class:is-dragging={dragging}
    class:is-positioned={x !== null}
    style={x !== null ? `left: ${x}px; top: ${y}px;` : ''}
    bind:this={cardEl}
  >
    <!-- Drag handle + dismiss -->
    <div class="drag-handle" onmousedown={onDragStart} role="none">
      <span class="handle-dots">⠿</span>
      <button class="btn-dismiss" onclick={() => layout.toggleNowPlaying()} title="Hide player" aria-label="Hide player">
        <span class="icon" style="font-size:16px">close</span>
      </button>
    </div>

    <!-- Status message bar -->
    {#if !playback.isLoaded}
      <div class="status-bar status-ready">
        <span class="icon" style="font-size:16px">radio_button_unchecked</span>
        No song loaded
      </div>
    {:else if !displaysStore.display1.open && !displaysStore.display2.open}
      <div class="status-bar status-warn">
        <span class="icon" style="font-size:16px">tv_off</span>
        No display open — open a display to start
      </div>
    {:else if playback.status === 'playing'}
      <div class="status-bar status-playing">
        <span class="icon" style="font-size:16px">fiber_manual_record</span>
        Now playing
        <span class="status-time">{formatTime(playback.currentTime)}</span>
      </div>
    {:else if playback.status === 'paused'}
      <div class="status-bar status-paused">
        <span class="icon" style="font-size:16px">pause_circle</span>
        Paused
        <span class="status-time">{formatTime(playback.currentTime)}</span>
      </div>
    {:else}
      <div class="status-bar status-ready">
        <span class="icon" style="font-size:16px">check_circle</span>
        Ready — press play to start
      </div>
    {/if}

    <!-- Song info + badges -->
    {#if playback.isLoaded && playback.song}
    <div class="song-section">
      <div class="song-info">
        <span class="song-title">{playback.song.title}</span>
        <span class="song-artist">{playback.song.artist}</span>
      </div>
      {#if allPlayerIds.length > 0}
        <div class="player-badges">
          {#each allPlayerIds as id (id)}
            <span class="badge" style="border-color: {PLAYER_COLORS[id] ?? '#888'}; color: {PLAYER_COLORS[id] ?? '#888'}">
              P{id}
            </span>
          {/each}
        </div>
      {/if}
    </div>
    {:else}
    <div class="empty-section">
      <span class="icon" style="font-size:32px; opacity:0.3">queue_music</span>
      <span class="text-muted text-sm">No song loaded</span>
    </div>
    {/if}

    <!-- Transport controls — always shown -->
    <div class="mixer">
      <HorizontalFader label="Song" level={gameChannel.level} gain={gameChannel.gain} ongainchange={(v) => gameChannel.setGain(v)} />
    </div>

    <!-- Transport controls — always shown -->
    <div class="controls">
      <!-- Home Screen -->
      <button
        class="ctrl-btn ctrl-clear"
        disabled={!hasDisplay || playback.isActive || (playback.status !== 'preview' && !playback.showClearBeamers)}
        title={!hasDisplay ? 'Open a display first' : playback.isActive ? 'Cannot clear while playing' : playback.status !== 'preview' && !playback.showClearBeamers ? 'Already on home screen' : 'Home Screen'}
        onclick={() => playback.clearBeamers()}
      >
        <span class="icon">tv_off</span>
      </button>

      <!-- Preview button -->
      <button
        class="ctrl-btn ctrl-preview"
        class:is-active={playback.status === 'preview'}
        disabled={!playback.isLoaded || playback.isActive || !hasDisplay || playback.status === 'preview'}
        title={!playback.isLoaded ? 'No song selected' : playback.isActive ? 'Cannot preview while playing' : !hasDisplay ? 'Open a display first' : playback.status === 'preview' ? 'Already showing preview' : 'Show preview on beamers'}
        onclick={() => playback.preview()}
      >
        <span class="icon">tv</span>
      </button>

      <!-- Play / Pause — swap on same spot -->
      {#if playback.status === 'playing'}
        <button class="ctrl-btn ctrl-pause" disabled={playback.isCountingDown}
          title={playback.isCountingDown ? 'Countdown in progress' : 'Pause'}
          onclick={() => playback.pause()}>
          <span class="icon">pause</span>
        </button>
      {:else}
        <button
          class="ctrl-btn ctrl-play"
          class:is-buffering={playback.isBuffering}
          disabled={!playback.isLoaded || (playback.status === 'paused' ? false : (!playback.canPlay || playback.isBuffering))}
          title={!playback.isLoaded ? 'No song selected' : playback.isBuffering ? 'Buffering video…' : playback.status === 'paused' ? 'Resume' : !playback.canPlay ? 'Open a display first' : 'Play'}
          onclick={() => playback.status === 'paused' ? playback.resume() : playback.play()}
        >
          {#if playback.isBuffering}
            <span class="icon spin">progress_activity</span>
          {:else}
            <span class="icon">play_arrow</span>
          {/if}
        </button>
      {/if}

      <!-- Stop -->
      <button
        class="ctrl-btn ctrl-stop"
        disabled={!playback.isActive}
        title={playback.isActive ? 'Stop' : 'Not playing'}
        onclick={() => playback.stop()}
      >
        <span class="icon">stop</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .now-playing-card {
    position: fixed;
    bottom: var(--space-6);
    left: 50%;
    translate: -50% 0;
    z-index: 200;
    background: color-mix(in srgb, var(--md-sys-color-surface-container-high) 88%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    width: 420px;
    user-select: none;
  }

  .now-playing-card.is-positioned {
    bottom: unset;
    left: unset;
    translate: none;
  }

  /* ── Drag handle ── */
  .drag-handle {
    padding: var(--space-2) var(--space-3);
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    position: relative;
  }
  .drag-handle:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 4%, transparent); }
  .is-dragging .drag-handle { cursor: grabbing; }
  .handle-dots { font-size: 14px; letter-spacing: 2px; opacity: 0.3; }

  .btn-dismiss {
    position: absolute;
    right: var(--space-2);
    top: 50%;
    translate: 0 -50%;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.4;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }
  .btn-dismiss:hover { opacity: 1; background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }

  /* ── Status bar ── */
  .status-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    border-top: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 50%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 50%, transparent);
  }
  .status-warn    { color: #ffb300; background: rgba(255,179,0,0.15); }
  .status-playing { color: #4ecb71; background: rgba(78,203,113,0.12); }
  .status-paused  { color: #ffb300; background: rgba(255,179,0,0.15); }
  .status-ready   { color: var(--md-sys-color-on-surface-variant); }

  .status-time {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
  }

  /* ── Song info + badges ── */
  .song-section {
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .empty-section {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    text-align: center;
  }

  .song-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .song-title {
    font-size: 1.25rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .song-artist {
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface-variant);
  }

  .player-badges {
    display: flex;
    gap: var(--space-2);
  }

  .badge {
    font-size: 12px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: var(--radius-full);
    border: 2px solid;
  }

  /* ── Transport controls ── */
  .mixer {
    padding: var(--space-3) var(--space-5) 0;
  }

  .controls {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-top: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 50%, transparent);
    justify-content: center;
  }

  .ctrl-btn {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.1s, opacity 0.15s, filter 0.15s;
  }
  .ctrl-btn :global(.icon) { font-size: 36px; }
  .ctrl-btn:active { transform: scale(0.93); }
  .ctrl-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    filter: none;
    transform: none;
  }
  .ctrl-btn:disabled:active { transform: none; }

  .ctrl-play {
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
  }
  .ctrl-play:hover:not(:disabled) { filter: brightness(1.15); }
  .ctrl-play.is-blocked {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .ctrl-play.is-blocked:active { transform: none; }
  .ctrl-play.is-buffering { opacity: 0.6; cursor: wait; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { display: inline-block; animation: spin 1s linear infinite; }

  .ctrl-pause {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }
  .ctrl-pause:hover:not(:disabled) { filter: brightness(1.15); }

  .ctrl-stop {
    background: rgba(247, 95, 95, 0.15);
    color: #f75f5f;
    border: 2px solid rgba(247, 95, 95, 0.4);
  }
  .ctrl-stop:hover:not(:disabled) { background: rgba(247, 95, 95, 0.25); }

  .ctrl-clear {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 6%, transparent);
    color: var(--md-sys-color-on-surface-variant);
    border: 2px solid color-mix(in srgb, var(--md-sys-color-outline) 30%, transparent);
  }
  .ctrl-clear:hover:not(:disabled) { background: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent); }

  .ctrl-preview {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 6%, transparent);
    color: var(--md-sys-color-on-surface-variant);
    border: 2px solid color-mix(in srgb, var(--md-sys-color-outline) 30%, transparent);
  }
  .ctrl-preview:hover:not(:disabled) { background: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent); }
  .ctrl-preview.is-active {
    background: color-mix(in srgb, var(--md-sys-color-primary) 15%, transparent);
    color: var(--md-sys-color-primary);
    border-color: var(--md-sys-color-primary);
  }
  .ctrl-preview.is-blocked { opacity: 0.35; cursor: not-allowed; }
</style>
