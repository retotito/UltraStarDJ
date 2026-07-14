<!--
  GameYouTube — hidden YouTube player that drives game playback for YouTube-only songs.
  No UI. Mirrors GameAudio.svelte exactly, but uses YT.Player instead of <audio>.
  Registers itself as the playback time provider.
  Starts playing WITH SOUND when the beamer countdown-done IPC fires.

  Placement: a 2×2px overflow:hidden container positioned off-screen so WebKit
  doesn't suppress autoplay or audio from hidden iframes.
  In production, tauri-plugin-localhost serves the app from http://localhost so
  YouTube accepts the embedding origin without any proxy.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import { onCountdownDone } from '$lib/ipc/tauri'
  import { gameChannel } from '$lib/audio/channels.svelte'

  let containerEl = $state<HTMLDivElement | undefined>(undefined)
  let ytPlayer: any = null
  let ytReady = $state(false)
  let ytError = $state<string | null>(null)
  let unlistenCountdown: (() => void) | null = null

  // Only active for YouTube-only songs (no local audio/video)
  const isYoutubeOnly = $derived.by(() => {
    const s = playback.song
    return !!s?.youtubeId && !s?.audioPath && !s?.videoPath
  })

  const youtubeId = $derived(playback.song?.youtubeId ?? null)

  $effect(() => {
    if (!isYoutubeOnly || !youtubeId || !containerEl) {
      destroyPlayer()
      return
    }
    ytError = null
    loadYTAPI(youtubeId)
  })

  function loadYTAPI(videoId: string) {
    console.log('[GameYouTube] loadYTAPI — origin:', window.location.origin, 'videoId:', videoId)
    const win = window as any
    if (win.YT?.Player) {
      initYTPlayer(videoId)
    } else {
      if (!document.getElementById('yt-iframe-api')) {
        const tag = document.createElement('script')
        tag.id = 'yt-iframe-api'
        tag.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(tag)
      }
      win.onYouTubeIframeAPIReady = () => initYTPlayer(videoId)
    }
  }

  function initYTPlayer(videoId: string) {
    destroyPlayer()
    if (!containerEl) return
    const div = document.createElement('div')
    containerEl.appendChild(div)
    ytPlayer = new (window as any).YT.Player(div, {
      videoId,
      playerVars: { autoplay: 0, mute: 0, controls: 0, disablekb: 1, fs: 0, rel: 0 },
      events: {
        onReady: () => {
          console.log('[GameYouTube] YT.Player ready — origin:', window.location.origin)
          ytPlayer?.setPlaybackQuality('tiny')
          ytReady = true
          playback.registerTimeProvider(() => ytPlayer?.getCurrentTime() ?? 0, 'GameYouTube')
        },
        onStateChange: (e: any) => {
          const states: Record<number, string> = { '-1': 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' }
          console.log('[GameYouTube] state →', states[e.data] ?? e.data)
          if (e.data === (window as any).YT?.PlayerState?.ENDED) playback.stop()
        },
        onError: (e: any) => {
          const blocked = e.data === 101 || e.data === 150 || e.data === 153
          ytError = blocked
            ? `YouTube blocked playback (error ${e.data}). This video may not allow embedding.`
            : `YouTube error (code ${e.data}).`
          console.error('[GameYouTube] onError', e.data)
          playback.stop()
        },
      },
    })
  }

  function destroyPlayer() {
    if (ytPlayer) { try { ytPlayer.destroy() } catch {} ; ytPlayer = null; ytReady = false }
    playback.unregisterTimeProvider('GameYouTube')
    if (containerEl) containerEl.innerHTML = ''
  }

  $effect(() => {
    if (!ytReady) return
    const s = playback.status
    if (s === 'playing') { if ((ytPlayer?.getCurrentTime() ?? 0) > 0) ytPlayer?.playVideo() }
    else if (s === 'paused') { ytPlayer?.pauseVideo() }
    else if (s === 'loaded' || s === 'idle') { ytPlayer?.stopVideo() }
  })

  $effect(() => {
    if (!ytReady) return
    const song = playback.song
    if (!song?.end) return
    const endSecs = song.end / 1000
    const interval = setInterval(() => {
      if ((ytPlayer?.getCurrentTime() ?? 0) >= endSecs) { playback.stop(); clearInterval(interval) }
    }, 200)
    return () => clearInterval(interval)
  })

  $effect(() => {
    const vol = Math.round(gameChannel.gain * 100)
    if (ytReady) ytPlayer?.setVolume(vol)
  })

  onMount(async () => {
    unlistenCountdown = await onCountdownDone(() => {
      if (!playback.isLoaded || !isYoutubeOnly) return
      ytPlayer?.playVideo()
    })
  })

  onDestroy(() => { unlistenCountdown?.(); destroyPlayer() })
</script>

{#if isYoutubeOnly}
  <div
    bind:this={containerEl}
    style="position:fixed; right:-4px; bottom:0; width:2px; height:2px; overflow:hidden; pointer-events:none;"
  ></div>
{/if}

{#if ytError}
  <div class="yt-error-toast">
    <span class="yt-error-icon">⚠</span>
    {ytError}
  </div>
{/if}

<style>
  .yt-error-toast {
    position: fixed;
    bottom: var(--space-4);
    left: 50%;
    translate: -50% 0;
    background: var(--md-sys-color-error-container);
    color: var(--md-sys-color-on-error-container);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--space-2);
    font: var(--text-sm) / 1.4 var(--font-sans);
    max-width: 480px;
    text-align: center;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .yt-error-icon { font-size: 1.2em; flex-shrink: 0; }
</style>
