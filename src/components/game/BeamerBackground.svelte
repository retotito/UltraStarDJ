<script lang="ts">
  import { onMount } from 'svelte'
  import type { Song } from '$lib/ultrastar/types'
  import { sendBeamerReady } from '$lib/ipc/tauri'

  let { song, assetBase, currentTime, playing = false, paused = false }: {
    song: Song
    assetBase: string
    currentTime: number
    playing?: boolean
    paused?: boolean
  } = $props()

  // Priority: videoPath > youtubeId > backgroundPath > coverPath > placeholder
  type BgType = 'video' | 'youtube' | 'image' | 'cover' | 'none'

  const bgType = $derived.by((): BgType => {
    if (song.videoPath) return 'video'
    if (song.youtubeId) return 'youtube'
    if (song.backgroundPath) return 'image'
    if (song.coverPath) return 'cover'
    return 'none'
  })

  // Video element ref for seek-sync
  let videoEl: HTMLVideoElement | undefined

  // Control video playback based on playing/paused props
  $effect(() => {
    if (!videoEl || bgType !== 'video') return
    if (paused) {
      videoEl.pause()
    } else if (playing && videoEl.paused) {
      videoEl.play().catch(() => {})
    }
  })

  // Sync video to currentTime when drift > 0.5s
  $effect(() => {
    if (!videoEl || bgType !== 'video' || paused) return
    const drift = Math.abs(videoEl.currentTime - currentTime)
    if (drift > 0.5) videoEl.currentTime = currentTime
  })

  // Non-video backgrounds are instantly ready
  onMount(() => {
    if (bgType !== 'video') {
      console.log('[BeamerBackground] ready instantly, bgType:', bgType)
      sendBeamerReady()
    } else {
      console.log('[BeamerBackground] video detected, waiting for canplaythrough…', song.videoPath)
    }
  })

  function onVideoCanPlay() {
    console.log('[BeamerBackground] canplaythrough fired — sending beamer-ready')
    sendBeamerReady()
  }
</script>

{#if bgType === 'video' && song.videoPath}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoEl}
    class="bg-media"
    src="{assetBase}{song.videoPath}"
    muted
    playsinline
    oncanplaythrough={onVideoCanPlay}
  ></video>

{:else if bgType === 'youtube' && song.youtubeId}
  <iframe
    class="bg-media"
    src="https://www.youtube-nocookie.com/embed/{song.youtubeId}?autoplay=1&mute=1&controls=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&enablejsapi=1"
    title="background video"
    allow="autoplay"
    referrerpolicy="no-referrer"
  ></iframe>

{:else if bgType === 'image' && song.backgroundPath}
  <img
    class="bg-media bg-image"
    src="{assetBase}{song.backgroundPath}"
    alt=""
    aria-hidden="true"
  />

{:else if bgType === 'cover' && song.coverPath}
  <img
    class="bg-media bg-cover"
    src="{assetBase}{song.coverPath}"
    alt=""
    aria-hidden="true"
  />

{:else}
  <div class="bg-gradient"></div>
{/if}

<style>
  .bg-media {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border: none;
  }

  .bg-image {
    object-fit: cover;
  }

  .bg-cover {
    object-fit: contain;
    background: #000;
    filter: blur(60px) brightness(0.4) saturate(1.5);
    transform: scale(1.1); /* hide blur edges */
  }

  /* A second unblurred cover centered on top — done in BeamerView */

  .bg-gradient {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 40%, #1a1a2e 0%, #000 100%);
  }
</style>
