<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { PlaySongPayload, PreviewSongPayload } from '$lib/ultrastar/types'
  import type { BeamerScreen } from '../../routes/beamer/+page.svelte'
  import LyricsRenderer from '$components/game/LyricsRenderer.svelte'
  import BeamerBackground from '$components/game/BeamerBackground.svelte'

  let { screen = 'idle', payload, assignedPlayerIds = [], currentTime = 0, onCountdownDone }: {
    screen?: BeamerScreen
    payload: PlaySongPayload | PreviewSongPayload | null
    assignedPlayerIds?: number[]
    currentTime?: number
    onCountdownDone?: () => void
  } = $props()

  const PLAYER_COLORS: Record<number, string> = {
    1: '#4f8ef7',
    2: '#f75f5f',
    3: '#4ecb71',
    4: '#f7c84f',
  }

  // Countdown logic
  let countdownValue = $state(3)
  let countdownTimer: ReturnType<typeof setInterval> | null = null

  $effect(() => {
    if (screen === 'countdown') {
      countdownValue = 3
      countdownTimer = setInterval(() => {
        countdownValue--
        if (countdownValue <= 0) {
          clearInterval(countdownTimer!)
          countdownTimer = null
          onCountdownDone?.()
        }
      }, 1000)
    } else {
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
    }
  })

  onDestroy(() => { if (countdownTimer) clearInterval(countdownTimer) })

  // Placeholder scores for score screen
  const placeholderScores: Record<number, number> = { 1: 8540, 2: 7230, 3: 9100, 4: 6800 }
</script>

<div class="beamer-view">

  {#if screen === 'idle'}
    <div class="idle-screen">
      <span class="logo-text">UltrastarDJ</span>
      {#if assignedPlayerIds.length > 0}
        <div class="player-badges">
          {#each assignedPlayerIds as id (id)}
            <div class="player-badge" style="border-color: {PLAYER_COLORS[id] ?? '#888'}; color: {PLAYER_COLORS[id] ?? '#888'}">
              P{id}
            </div>
          {/each}
        </div>
      {:else}
        <span class="waiting">No players assigned</span>
      {/if}
    </div>

  {:else if screen === 'preview' && payload}
    <div class="preview-screen">
      <!-- Preload background media during preview so it's fully buffered before playback -->
      <div class="preload-bg" aria-hidden="true">
        <BeamerBackground song={payload.song} assetBase={payload.assetBase} currentTime={0} />
      </div>
      {#if payload.song.coverPath}
        <img
          class="preview-cover"
          src="{payload.assetBase}{payload.song.coverPath}"
          alt="{payload.song.title} cover"
        />
      {/if}
      <div class="preview-content">
        <span class="preview-artist">{payload.song.artist}</span>
        <span class="preview-title">{payload.song.title}</span>
        {#if payload.song.year}
          <span class="preview-year">{payload.song.year}</span>
        {/if}
      </div>
      <div class="player-badges">
        {#each assignedPlayerIds as id (id)}
          <div class="player-badge" style="border-color: {PLAYER_COLORS[id] ?? '#888'}; color: {PLAYER_COLORS[id] ?? '#888'}">
            P{id}
          </div>
        {/each}
      </div>
      <span class="preview-ready">Get ready…</span>
    </div>

  {:else if screen === 'countdown' && payload}
    <div class="countdown-screen">
      <div class="song-splash">
        <span class="splash-artist">{payload.song.artist}</span>
        <span class="splash-title">{payload.song.title}</span>
      </div>
      <div class="countdown-number" key={countdownValue}>{countdownValue}</div>
      <div class="player-badges">
        {#each assignedPlayerIds as id (id)}
          <div class="player-badge" style="border-color: {PLAYER_COLORS[id] ?? '#888'}; color: {PLAYER_COLORS[id] ?? '#888'}">
            P{id}
          </div>
        {/each}
      </div>
    </div>

  {:else if (screen === 'playing' || screen === 'paused') && payload}
    <div class="playing-screen">
      <BeamerBackground song={payload.song} assetBase={payload.assetBase} {currentTime} />
      <div class="playing-overlay">
        <div class="now-playing-header">
          <span class="np-artist">{payload.song.artist}</span>
          <span class="np-title">{payload.song.title}</span>
          {#if screen === 'paused'}
            <span class="paused-badge">PAUSED</span>
          {/if}
        </div>
        <div class="lyrics-area">
          {#if payload.song.notes && payload.song.notes.length > 0}
            <LyricsRenderer
              tracks={payload.song.notes}
              {currentTime}
              bpm={payload.song.bpm}
              gap={payload.song.gap}
              videoGap={payload.song.videoGap ?? 0}
            />
          {:else}
            <span class="lyrics-placeholder">♪ No lyrics available ♪</span>
          {/if}
        </div>
      </div>
    </div>

  {:else if screen === 'score' && payload}
    <div class="score-screen">
      <span class="score-title">Great singing! 🎤</span>
      <span class="score-song">{payload.song.artist} — {payload.song.title}</span>
      <div class="score-rows">
        {#each assignedPlayerIds as id (id)}
          <div class="score-row">
            <div class="player-badge" style="border-color: {PLAYER_COLORS[id] ?? '#888'}; color: {PLAYER_COLORS[id] ?? '#888'}">
              P{id}
            </div>
            <div class="score-bar-wrap">
              <div class="score-bar" style="width: {(placeholderScores[id] ?? 5000) / 100}%; background: {PLAYER_COLORS[id] ?? '#888'}"></div>
            </div>
            <span class="score-value">{(placeholderScores[id] ?? 5000).toLocaleString()}</span>
          </div>
        {/each}
      </div>
      <span class="score-hint">Stop again to return to home screen</span>
    </div>
  {/if}

</div>

<style>
  .beamer-view {
    width: 100vw;
    height: 100vh;
    background: #000;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* ── Idle ── */
  .idle-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-6);
  }

  .logo-text {
    font-size: 4rem;
    font-weight: 700;
    color: var(--md-sys-color-primary);
    letter-spacing: 0.05em;
  }

  .waiting {
    color: rgba(255,255,255,0.3);
    font-size: 1.2rem;
  }

  /* ── Shared: player badges ── */
  .player-badges {
    display: flex;
    gap: var(--space-4);
    justify-content: center;
  }

  .player-badge {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    border: 3px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 700;
  }

  /* ── Preview ── */
  .preview-screen {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-6);
    height: 100%;
  }

  .preview-cover {
    width: 220px;
    height: 220px;
    object-fit: cover;
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
  }

  .preview-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    text-align: center;
  }

  .preview-artist {
    font-size: clamp(1.5rem, 4vw, 3rem);
    font-weight: 400;
    opacity: 0.7;
    letter-spacing: 0.05em;
  }

  .preview-title {
    font-size: clamp(2.5rem, 7vw, 6rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .preview-year {
    font-size: 1.2rem;
    opacity: 0.4;
  }

  .preview-ready {
    font-size: 1.2rem;
    opacity: 0.5;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.7; }
  }

  /* ── Countdown ── */
  .countdown-screen {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-8);
  }

  .preload-bg {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .song-splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    text-align: center;
  }

  .splash-artist {
    font-size: 1.5rem;
    color: rgba(255,255,255,0.6);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .splash-title {
    font-size: 3rem;
    font-weight: 700;
  }

  .countdown-number {
    font-size: 12rem;
    font-weight: 900;
    color: var(--md-sys-color-primary);
    line-height: 1;
    animation: countdown-pop 0.3s ease-out;
  }

  @keyframes countdown-pop {
    from { transform: scale(1.4); opacity: 0.5; }
    to   { transform: scale(1);   opacity: 1; }
  }

  /* ── Playing ── */
  .playing-screen {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .playing-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding: var(--space-6);
    background: linear-gradient(to bottom,
      rgba(0,0,0,0.55) 0%,
      rgba(0,0,0,0.1) 40%,
      rgba(0,0,0,0.1) 60%,
      rgba(0,0,0,0.7) 100%
    );
  }

  .now-playing-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid rgba(255,255,255,0.15);
  }

  .np-artist {
    font-size: 1.2rem;
    color: rgba(255,255,255,0.5);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .np-title {
    font-size: 2rem;
    font-weight: 700;
  }

  .paused-badge {
    background: rgba(255,200,0,0.2);
    color: #f7c84f;
    border: 1px solid #f7c84f;
    border-radius: var(--radius-full);
    padding: 2px 12px;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.1em;
  }

  .lyrics-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .lyrics-placeholder {
    color: rgba(255,255,255,0.3);
    font-size: 1.5rem;
  }

  /* ── Score ── */
  .score-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-6);
    width: 100%;
    max-width: 700px;
    padding: var(--space-8);
  }

  .score-title {
    font-size: 3rem;
    font-weight: 700;
  }

  .score-song {
    font-size: 1.2rem;
    color: rgba(255,255,255,0.5);
  }

  .score-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: 100%;
  }

  .score-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .score-bar-wrap {
    flex: 1;
    height: 20px;
    background: rgba(255,255,255,0.1);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .score-bar {
    height: 100%;
    border-radius: var(--radius-full);
    transition: width 1s ease-out;
  }

  .score-value {
    min-width: 70px;
    text-align: right;
    font-size: 1.2rem;
    font-weight: 700;
  }

  .score-hint {
    color: rgba(255,255,255,0.3);
    font-size: 0.9rem;
  }
</style>

