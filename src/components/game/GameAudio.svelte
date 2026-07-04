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

  let audioEl: HTMLAudioElement | undefined
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
      playback.registerTimeProvider(() => audioEl!.currentTime)
    } else {
      playback.unregisterTimeProvider()
    }
  })

  // React to playback status changes
  $effect(() => {
    if (!audioEl) return
    const s = playback.status
    if (s === 'paused') {
      audioEl.pause()
    } else if (s === 'loaded' || s === 'idle') {
      audioEl.pause()
      audioEl.currentTime = 0
    }
    // 'playing' is handled by the countdown-done listener
  })

  onMount(async () => {
    // Start audio exactly when the beamer countdown finishes
    unlistenCountdown = await onCountdownDone(() => {
      if (!audioEl || !playback.isLoaded) return
      console.log('[GameAudio] countdown-done — starting audio')
      audioEl.play().catch(e => console.error('[GameAudio] play() rejected:', e))
    })
    playback.registerTimeProvider(() => audioEl?.currentTime ?? 0)
  })

  onDestroy(() => {
    unlistenCountdown?.()
    playback.unregisterTimeProvider()
  })
</script>

<!-- Hidden audio element — no visual output -->
{#if audioSrc}
  <audio
    bind:this={audioEl}
    src={audioSrc}
    preload="auto"
    style="display:none"
  ></audio>
{/if}
