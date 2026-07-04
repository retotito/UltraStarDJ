<!--
  VideoPreloader — hidden video element in the DJ window.
  Preloads song.videoPath when a video song is loaded.
  Fires playback.setBufferingDone() when canplaythrough fires.
  Completely invisible — no UI.
-->
<script lang="ts">
  import { playback } from '$lib/stores/playback.svelte'
  import { toAssetUrl } from '$lib/ipc/tauri'

  const videoSrc = $derived.by(() => {
    const s = playback.song
    if (!s?.videoPath) return null
    return toAssetUrl(s.videoPath)
  })

  function onCanPlayThrough() {
    const t = performance.now().toFixed(0)
    console.log(`[VideoPreloader ${t}ms] canplaythrough — video ready`)
    playback.setBufferingDone()
  }

  function onError() {
    const t = performance.now().toFixed(0)
    console.warn(`[VideoPreloader ${t}ms] video load error — unblocking anyway`)
    playback.setBufferingDone()  // don't leave buttons blocked forever on error
  }
</script>

<!-- Hidden video — preloads in background, no display -->
{#if videoSrc}
  <video
    src={videoSrc}
    preload="auto"
    muted
    playsinline
    style="display:none"
    oncanplaythrough={onCanPlayThrough}
    onerror={onError}
  ></video>
{/if}
