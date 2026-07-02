<script lang="ts">
  import { onDestroy } from 'svelte'
  import Plyr from 'plyr'
  import 'plyr/dist/plyr.css'
  import { player } from '$lib/stores/player.svelte'
  import { songQueue } from '$lib/stores/queue.svelte'
  import { network } from '$lib/stores/network.svelte'
  import { toAssetUrl } from '$lib/ipc/tauri'
  import placeholderSrc from '$lib/assets/song-placeholder.svg'

  type MediaType = 'video' | 'youtube' | 'audio' | 'none'

  const mediaType = $derived.by((): MediaType => {
    const s = player.song
    if (!s) return 'none'
    if (s.videoPath) return 'video'
    if (s.youtubeId && network.isOnline) return 'youtube'
    if (s.audioPath) return 'audio'
    return 'none'
  })

  const coverSrc = $derived(
    player.song?.coverPath ? toAssetUrl(player.song.coverPath) : placeholderSrc
  )
  const isOfflineYoutube = $derived(
    !!player.song?.youtubeId && !player.song?.videoPath && !player.song?.audioPath && !network.isOnline
  )

  let plyrEl = $state<HTMLVideoElement | HTMLAudioElement | null>(null)
  let plyrInstance: Plyr | null = null

  function destroyPlyr() {
    if (plyrInstance) {
      try { plyrInstance.destroy() } catch {}
      plyrInstance = null
    }
  }

  $effect(() => {
    const _song = player.song
    destroyPlyr()
  })

  $effect(() => {
    const el = plyrEl
    const type = mediaType
    if (!el || (type !== 'video' && type !== 'audio')) return
    destroyPlyr()
    plyrInstance = new Plyr(el, {
      controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume'],
      autoplay: false,
      resetOnEnd: true,
      youtube: { noCookie: true, rel: 0, showinfo: 0 }
    })
  })

  onDestroy(destroyPlyr)

  function addToQueue() {
    if (player.song) songQueue.add(player.song)
  }
</script>

<div class="player-widget">
  {#if player.song}
    <div class="media-area">
      {#if mediaType === 'video' && player.song.videoPath}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={plyrEl} src={toAssetUrl(player.song.videoPath)} playsinline></video>

      {:else if mediaType === 'youtube' && player.song.youtubeId}
        <div class="yt-embed">
          <iframe
            src="https://www.youtube-nocookie.com/embed/{player.song.youtubeId}?origin=https://tauri.localhost&iv_load_policy=3&modestbranding=1&playsinline=1&showinfo=0&rel=0&enablejsapi=1"
            title={player.song.title}
            allowfullscreen
          ></iframe>
        </div>

      {:else if mediaType === 'audio' && player.song.audioPath}
        <div class="audio-backdrop" style="background-image: url('{coverSrc}')">
          <audio bind:this={plyrEl} src={toAssetUrl(player.song.audioPath)}></audio>
        </div>

      {:else if isOfflineYoutube}
        <div class="media-placeholder">
          <img src={coverSrc} alt="Cover" />
          <span class="offline-badge"><span class="icon icon-sm">wifi_off</span>Offline</span>
        </div>

      {:else}
        <div class="media-placeholder">
          <img src={placeholderSrc} alt="No media" />
        </div>
      {/if}
    </div>

    <div class="song-info">
      <p class="song-title truncate">{player.song.title}</p>
      <p class="song-artist truncate text-muted text-sm">{player.song.artist}</p>
      {#if player.song.year}
        <p class="text-xs text-muted">{player.song.year}{player.song.language ? ` · ${player.song.language}` : ''}</p>
      {/if}
    </div>

    <div class="actions">
      <button class="btn btn-tonal" onclick={addToQueue}>
        <span class="icon icon-sm">queue_music</span>
        Add to Queue
      </button>
    </div>

  {:else}
    <div class="empty-state">
      <img src={placeholderSrc} alt="" class="empty-placeholder" />
      <p class="text-muted text-sm">Select a song to preview</p>
    </div>
  {/if}
</div>

<style>
  .player-widget {
    display: flex;
    flex-direction: column;
    padding: var(--space-3);
    gap: var(--space-3);
    overflow: hidden;
  }

  .media-area {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: #000;
    flex-shrink: 0;
    position: relative;
  }

  .media-area video,
  .media-area :global(.plyr) {
    width: 100% !important;
    height: 100% !important;
  }

  .audio-backdrop {
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .audio-backdrop :global(.plyr--audio) {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
  }

  .yt-embed {
    width: 100%;
    height: 100%;
  }
  .yt-embed iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  .media-placeholder {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .media-placeholder img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .offline-badge {
    position: absolute;
    bottom: var(--space-2);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    background: rgba(0,0,0,0.72);
    color: #fff;
    font-size: var(--text-xs);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  .song-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .song-title {
    font-weight: var(--font-weight-semibold);
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface);
  }

  .actions .btn {
    width: 100%;
    justify-content: center;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .empty-placeholder {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: var(--radius-md);
    object-fit: cover;
    opacity: 0.3;
  }
</style>
