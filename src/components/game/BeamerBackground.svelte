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
  // YouTube IFrame API player instance
  let ytPlayer: any = null
  let ytDiv: HTMLDivElement | undefined
  let ytReady = $state(false)

  // Desired play state while ytPlayer initialises
  let ytPendingPlay = false

  function initYTPlayer(videoId: string) {
    if (!ytDiv) return
    const t = performance.now().toFixed(0)
    console.log(`[BeamerBackground ${t}ms] initYTPlayer — ytDiv:${!!ytDiv}`)
    ytPlayer = new (window as any).YT.Player(ytDiv, {
      videoId,
      playerVars: {
        autoplay: 1, mute: 1, controls: 0, rel: 0, fs: 0,
        disablekb: 1, modestbranding: 1, playsinline: 1,
      },
      events: {
        onReady: (e: any) => {
          const t2 = performance.now().toFixed(0)
          console.log(`[BeamerBackground ${t2}ms] YT.Player onReady`)
          e.target.setPlaybackQuality('hd720')  // cap at 720p — sufficient for projectors
          ytReady = true
          if (ytPendingPlay) e.target.playVideo()
        },
        onStateChange: (e: any) => {
          const t2 = performance.now().toFixed(0)
          console.log(`[BeamerBackground ${t2}ms] YT.Player stateChange:${e.data}`)
        },
      },
    })
  }

  function loadYTAPI(videoId: string) {
    if ((window as any).YT?.Player) {
      initYTPlayer(videoId)
      return
    }
    const existing = document.getElementById('yt-api-script')
    if (!existing) {
      const script = document.createElement('script')
      script.id = 'yt-api-script'
      script.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(script)
    }
    ;(window as any).onYouTubeIframeAPIReady = () => initYTPlayer(videoId)
  }

  // Control video playback based on playing/paused props
  $effect(() => {
    if (bgType !== 'video') return
    if (!videoEl) return
    const videoGapSecs = song.videoGap ?? 0
    if (paused) {
      videoEl.pause()
    } else if (playing && videoEl.paused) {
      // Seek to correct position before starting (videoGap offset + current audio time)
      const targetTime = currentTime + videoGapSecs
      if (Math.abs(videoEl.currentTime - targetTime) > 0.1) {
        videoEl.currentTime = targetTime
      }
      videoEl.play().catch(() => {})
    }
  })

  // Control YouTube playback via YT.Player API
  $effect(() => {
    if (bgType !== 'youtube') return
    const t = performance.now().toFixed(0)
    console.log(`[BeamerBackground ${t}ms] yt effect — playing:${playing} paused:${paused} ready:${ytReady}`)
    if (!ytReady) {
      ytPendingPlay = playing
      return
    }
    if (paused) ytPlayer?.pauseVideo()
    else if (playing) ytPlayer?.playVideo()
  })

  // Sync video to currentTime when drift > 0.5s
  // videoGap (seconds) = how far into the video to be when audio is at 0s
  $effect(() => {
    if (!videoEl || bgType !== 'video' || paused) return
    if (currentTime === 0) return  // time provider not active yet — don't seek to 0
    const videoGapSecs = song.videoGap ?? 0
    const targetTime = currentTime + videoGapSecs
    const drift = Math.abs(videoEl.currentTime - targetTime)
    if (drift > 0.5) videoEl.currentTime = targetTime
  })

  // Sync YouTube to currentTime when drift > 0.5s
  $effect(() => {
    if (!ytReady || bgType !== 'youtube' || paused) return
    if (currentTime === 0) return  // time provider not active yet — don't seek to 0
    const videoGapSecs = song.videoGap ?? 0
    const targetTime = currentTime + videoGapSecs
    const ytTime: number = ytPlayer?.getCurrentTime() ?? targetTime
    const drift = Math.abs(ytTime - targetTime)
    const t = performance.now().toFixed(0)
    console.log(`[BeamerBackground ${t}ms] yt-sync currentTime:${currentTime.toFixed(2)} ytTime:${ytTime.toFixed(2)} target:${targetTime.toFixed(2)} drift:${drift.toFixed(2)}`)
    if (drift > 0.5) {
      console.log(`[BeamerBackground ${t}ms] yt-sync SEEK → ${targetTime.toFixed(2)}`)
      ytPlayer?.seekTo(targetTime, true)
    }
  })

  // Non-video backgrounds are instantly ready
  onMount(() => {
    const t = performance.now().toFixed(0)
    if (bgType === 'youtube' && song.youtubeId) {
      console.log(`[BeamerBackground ${t}ms] bgType:youtube — loading YT API`)
      loadYTAPI(song.youtubeId)
      sendBeamerReady()
    } else if (bgType !== 'video') {
      console.log(`[BeamerBackground ${t}ms] bgType:${bgType} — ready instantly, sending beamer-ready`)
      sendBeamerReady()
    } else {
      console.log(`[BeamerBackground ${t}ms] bgType:video — waiting for canplaythrough…`, song.videoPath)
    }
  })

  function onVideoCanPlay() {
    const t = performance.now().toFixed(0)
    console.log(`[BeamerBackground ${t}ms] canplaythrough fired — sending beamer-ready`)
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
  <div bind:this={ytDiv} class="bg-media yt-container"></div>

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

  /* YT IFrame API replaces the div with an iframe — ensure it fills */
  .yt-container :global(iframe) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
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
