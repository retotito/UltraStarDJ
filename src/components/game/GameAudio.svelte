<!--
  GameAudio — hidden audio element that drives game playback.
  No UI. Completely separate from the preview player (PlayerWidget).
  Registers itself as the playback time provider.
  Starts playing when the beamer countdown-done IPC fires.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import { onCountdownDone, toAssetUrl } from '$lib/ipc/tauri'

  let audioEl = $state<HTMLAudioElement | undefined>(undefined)
  let unlistenCountdown: (() => void) | null = null

  const audioSrc = $derived.by(() => {
    const s = playback.song
    if (!s) return null
    if (s.audioPath) return toAssetUrl(s.audioPath)
    if (s.videoPath) return toAssetUrl(s.videoPath)   // MP4 audio fallback
    return null
  })

  // Register/unregister as time provider when song is loaded/unloaded
  $effect(() => {
    if (playback.isLoaded && audioEl) {
      console.log('[GameAudio] registering time provider, src:', audioSrc)
      playback.registerTimeProvider(() => audioEl!.currentTime, 'GameAudio')
    } else {
      playback.unregisterTimeProvider('GameAudio')
    }
  })

  // React to playback status changes
  $effect(() => {
    const s = playback.status
    if (s === 'playing') {
      // Only resume if we've already started (currentTime > 0).
      // Initial start must wait for countdown-done IPC, not this effect.
      if (audioEl && audioEl.paused && audioEl.currentTime > 0) {
        console.log('[GameAudio] status → playing (resume from pause), calling play()')
        audioEl.play().catch(e => console.error('[GameAudio] resume play() rejected:', e))
      }
    } else if (s === 'paused') {
      console.log('[GameAudio] status → paused')
      audioEl?.pause()
    } else if (s === 'loaded' || s === 'idle') {
      console.log('[GameAudio] status → stopped/reset')
      audioEl?.pause()
      if (audioEl) audioEl.currentTime = 0
    }
  })

  onMount(async () => {
    // Start audio exactly when the beamer countdown finishes
    unlistenCountdown = await onCountdownDone(() => {
      if (!audioEl || !playback.isLoaded) return
      console.log('[GameAudio] countdown-done — starting audio')
      audioEl.play().catch(e => console.error('[GameAudio] play() rejected:', e))
    })
    // Only register if audio element is actually mounted (not YouTube-only songs)
    if (audioEl) playback.registerTimeProvider(() => audioEl!.currentTime, 'GameAudio')
  })

  // Auto-stop when audio finishes — must be a $effect so it runs after audioEl mounts
  $effect(() => {
    if (!audioEl) return
    const onEnded = () => {
      console.log('[GameAudio] ended — calling playback.stop()')
      playback.stop()
    }
    audioEl.addEventListener('ended', onEnded)
    return () => audioEl?.removeEventListener('ended', onEnded)
  })

  // Stop at #END if defined (timeupdate is sufficient — fires every ~250ms)
  $effect(() => {
    if (!audioEl) return
    const song = playback.song
    if (!song?.end) return
    const endSecs = song.end / 1000
    const onTimeUpdate = () => {
      if (audioEl && audioEl.currentTime >= endSecs) {
        console.log('[GameAudio] reached #END — calling playback.stop()')
        playback.stop()
      }
    }
    audioEl.addEventListener('timeupdate', onTimeUpdate)
    return () => audioEl?.removeEventListener('timeupdate', onTimeUpdate)
  })

  onDestroy(() => {
    unlistenCountdown?.()
    playback.unregisterTimeProvider('GameAudio')
  })
</script>

<!-- Only mount when there is a real audio source (YouTube-only songs have none) -->
{#if audioSrc}
  <audio
    bind:this={audioEl}
    src={audioSrc}
    preload="auto"
    style="display:none"
  ></audio>
{/if}
