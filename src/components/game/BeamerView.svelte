<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { PlaySongPayload } from '$lib/ultrastar/types'
  import type { BeamerScreen } from '../../routes/beamer/+page.svelte'

  let { screen = 'idle', payload, assignedPlayerIds = [], onCountdownDone }: {
    screen?: BeamerScreen
    payload: PlaySongPayload | null
    assignedPlayerIds?: number[]
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
      <div class="now-playing-header">
        <span class="np-artist">{payload.song.artist}</span>
        <span class="np-title">{payload.song.title}</span>
        {#if screen === 'paused'}
          <span class="paused-badge">PAUSED</span>
        {/if}
      </div>
      <div class="lyrics-area">
        <span class="lyrics-placeholder">♪ Lyrics coming in Sprint 7 ♪</span>
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

  /* ── Countdown ── */
  .countdown-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-8);
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
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: var(--space-6);
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

