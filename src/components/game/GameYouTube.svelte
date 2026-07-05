<!--
  GameYouTube — hidden YouTube player that drives game playback for YouTube-only songs.
  No UI. Mirrors GameAudio.svelte exactly, but uses YT.Player instead of <audio>.
  Registers itself as the playback time provider.
  Starts playing WITH SOUND when the beamer countdown-done IPC fires.

  Placement: a 2×2px overflow:hidden container positioned off-screen so WebKit
  doesn't suppress autoplay or audio from hidden iframes.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import { onCountdownDone } from '$lib/ipc/tauri'
  import { gameChannel } from '$lib/audio/channels.svelte'

  let containerEl = $state<HTMLDivElement | undefined>(undefined)
  let ytPlayer: any = null
  let ytReady = $state(false)
  let unlistenCountdown: (() => void) | null = null

  // Only active for YouTube-only songs (no local audio/video)
  const isYoutubeOnly = $derived.by(() => {
    const s = playback.song
    return !!s?.youtubeId && !s?.audioPath && !s?.videoPath
  })

  const youtubeId = $derived(playback.song?.youtubeId ?? null)

  // Load/destroy the YT.Player when isYoutubeOnly or youtubeId changes
  $effect(() => {
    if (!isYoutubeOnly || !youtubeId || !containerEl) {
      destroyPlayer()
      return
    }
    loadYTAPI(youtubeId)
  })

  function loadYTAPI(videoId: string) {
    const win = window as any
    if (win.YT?.Player) {
      initYTPlayer(videoId)
    } else {
      // Load the IFrame API script once
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

    // Create a div inside the container for YT.Player to replace
    const div = document.createElement('div')
    containerEl.appendChild(div)

    ytPlayer = new (window as any).YT.Player(div, {
      videoId,
      playerVars: {
        autoplay: 0,
        mute: 0,         // sound ON — this is the DJ audio source
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
      },
      events: {
        onReady: () => {
          console.log('[GameYouTube] YT.Player ready')
          ytPlayer?.setPlaybackQuality('tiny')  // lowest quality — audio source only
          ytReady = true
          playback.registerTimeProvider(() => ytPlayer?.getCurrentTime() ?? 0, 'GameYouTube')
        },
        onStateChange: (e: any) => {
          const YT = (window as any).YT
          if (e.data === YT?.PlayerState?.ENDED) {
            console.log('[GameYouTube] ended — calling playback.stop()')
            playback.stop()
          }
        },
      },
    })
  }

  function destroyPlayer() {
    if (ytPlayer) {
      try { ytPlayer.destroy() } catch {}
      ytPlayer = null
      ytReady = false
    }
    playback.unregisterTimeProvider('GameYouTube')
    if (containerEl) containerEl.innerHTML = ''
  }

  // React to playback status changes
  $effect(() => {
    if (!ytReady) return
    const s = playback.status
    if (s === 'playing') {
      // Resume only if already started (currentTime > 0) — initial start is via countdown-done
      const ct = ytPlayer?.getCurrentTime() ?? 0
      if (ct > 0) {
        console.log('[GameYouTube] status → playing (resume)')
        ytPlayer?.playVideo()
      }
    } else if (s === 'paused') {
      console.log('[GameYouTube] status → paused')
      ytPlayer?.pauseVideo()
    } else if (s === 'loaded' || s === 'idle') {
      console.log('[GameYouTube] status → stopped/reset')
      ytPlayer?.stopVideo()
    }
  })

  // Stop at #END if defined
  $effect(() => {
    if (!ytReady) return
    const song = playback.song
    if (!song?.end) return
    // Poll via the tick — YT.Player has no reliable timeupdate event
    // The 100ms tick interval is sufficient for #END accuracy
    const endSecs = song.end / 1000
    const interval = setInterval(() => {
      const ct = ytPlayer?.getCurrentTime() ?? 0
      if (ct >= endSecs) {
        console.log('[GameYouTube] reached #END — calling playback.stop()')
        playback.stop()
        clearInterval(interval)
      }
    }, 200)
    return () => clearInterval(interval)
  })

  // Sync gameChannel gain → YouTube player volume (0–1 → 0–100)
  $effect(() => {
    const vol = Math.round(gameChannel.gain * 100)
    if (ytReady) ytPlayer?.setVolume(vol)
  })

  onMount(async () => {
    unlistenCountdown = await onCountdownDone(() => {
      if (!playback.isLoaded || !isYoutubeOnly) return
      console.log('[GameYouTube] countdown-done — starting YouTube playback')
      ytPlayer?.playVideo()
    })
  })

  onDestroy(() => {
    unlistenCountdown?.()
    destroyPlayer()
  })
</script>

<!--
  2×2px container clipped by overflow:hidden — WebKit plays audio from it,
  but no video is visible. Position is fixed off the right edge of the screen.
-->
{#if isYoutubeOnly}
  <div
    bind:this={containerEl}
    style="position:fixed; right:-4px; bottom:0; width:2px; height:2px; overflow:hidden; pointer-events:none;"
  ></div>
{/if}
