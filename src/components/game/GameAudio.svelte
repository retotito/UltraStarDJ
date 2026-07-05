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

  // videoGap offset: only applies when audio comes from a video file (no separate audioPath).
  // In that case, both audio and visual skip the first videoGap seconds of the file,
  // and currentTime is reported as (file position - videoGap) so the game clock starts at 0.
  const videoGapOffset = $derived.by(() => {
    const s = playback.song
    if (!s || s.audioPath) return 0   // separate audio file — no offset
    return s.videoGap ?? 0            // video-as-audio (Case 6): skip intro
  })

  // Register/unregister as time provider when song is loaded/unloaded
  $effect(() => {
    if (playback.isLoaded && audioEl) {
      console.log('[GameAudio] registering time provider, src:', audioSrc, 'videoGapOffset:', videoGapOffset)
      playback.registerTimeProvider(() => audioEl!.currentTime - videoGapOffset, 'GameAudio')
    } else {
      playback.unregisterTimeProvider('GameAudio')
    }
  })

  // React to playback status changes
  $effect(() => {
    const s = playback.status
    if (s === 'playing') {
      // Only resume if we've already started playing past the start position.
      // audioEl.currentTime > videoGapOffset means audio has actually played (not just seeked to start).
      if (audioEl && audioEl.paused && audioEl.currentTime > videoGapOffset) {
        console.log('[GameAudio] status → playing (resume from pause), calling play()')
        audioEl.play().catch(e => console.error('[GameAudio] resume play() rejected:', e))
      }
    } else if (s === 'paused') {
      console.log('[GameAudio] status → paused')
      audioEl?.pause()
    } else if (s === 'loaded' || s === 'idle') {
      console.log('[GameAudio] status → stopped/reset')
      audioEl?.pause()
      if (audioEl) audioEl.currentTime = videoGapOffset  // reset to start position
    }
  })

  onMount(async () => {
    // Start audio exactly when the beamer countdown finishes
    unlistenCountdown = await onCountdownDone(() => {
      if (!audioEl || !playback.isLoaded) return
      console.log('[GameAudio] countdown-done — starting audio, videoGapOffset:', videoGapOffset)
      if (videoGapOffset > 0) audioEl.currentTime = videoGapOffset
      audioEl.play().catch(e => console.error('[GameAudio] play() rejected:', e))
    })
    // Only register if audio element is actually mounted (not YouTube-only songs)
    if (audioEl) playback.registerTimeProvider(() => audioEl!.currentTime - videoGapOffset, 'GameAudio')
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
      // Compare game time (file position minus videoGap offset) against #END value
      if (audioEl && (audioEl.currentTime - videoGapOffset) >= endSecs) {
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
