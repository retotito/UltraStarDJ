<script lang="ts">
  import { onDestroy } from 'svelte'
  import Plyr from 'plyr'
  import 'plyr/dist/plyr.css'
  import { untrack } from 'svelte'
  import { player } from '$lib/stores/player.svelte'
  import { songQueue } from '$lib/stores/queue.svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import { network } from '$lib/stores/network.svelte'
  import { toAssetUrl, needsTranscode, transcodeToMp4, deleteTempFile, onCountdownDone } from '$lib/ipc/tauri'
  import placeholderSrc from '$lib/assets/song-placeholder.svg'
  import type { Song } from '$lib/ultrastar/types'

  type MediaType = 'video' | 'youtube' | 'audio' | 'none'

  // When a song is loaded into playback, use that for Plyr (audio master clock).
  // Otherwise fall back to the preview player song.
  const plyrSong = $derived(playback.isLoaded ? playback.song : player.song)

  const mediaType = $derived.by((): MediaType => {
    const s = plyrSong
    if (!s) return 'none'
    if (s.audioPath) return 'audio'          // MP3 always preferred for audio
    if (s.videoPath) return 'video'          // MP4 audio fallback (no MP3)
    if (s.youtubeId && network.isOnline) return 'youtube'
    return 'none'
  })

  // Cover: synchronous media:// URL — no async, no timing issues
  const coverSrc = $derived(
    player.song?.coverPath ? toAssetUrl(player.song.coverPath) : placeholderSrc
  )

  const isOfflineYoutube = $derived(
    !!player.song?.youtubeId && !player.song?.videoPath && !player.song?.audioPath && !network.isOnline
  )

  // Transcoded temp file state
  let transcodedPath = $state<string | null>(null)
  let transcoding = $state(false)
  let transcodeError = $state<string | null>(null)

  // Plyr instance ref — set by the action so $effect can drive play/pause/stop
  let plyrRef: Plyr | null = null
  let playDelayTimer: ReturnType<typeof setTimeout> | null = null

  // Listen for beamer countdown-done event to start audio at the right moment
  const unlistenCountdown = onCountdownDone(() => {
    if (!playback.isLoaded) return   // ignore if preview player is active
    if (playDelayTimer) { clearTimeout(playDelayTimer); playDelayTimer = null }
    plyrPlay()
  })
  onDestroy(async () => (await unlistenCountdown)())

  function plyrPlay() {
    if (!plyrRef) { console.warn('[PlayerWidget] plyrPlay called but plyrRef is null'); return }
    console.log('[PlayerWidget] plyrPlay() — starting audio')
    const p = plyrRef.play()
    if (p instanceof Promise) p.catch(e => console.error('[PlayerWidget] plyr.play() rejected:', e))
  }

  // Drive Plyr from playback store status — ONLY when a game song is loaded.
  // When playback is idle, plyrRef is the preview player and must not be controlled here.
  $effect(() => {
    const s = playback.status
    if (playDelayTimer) { clearTimeout(playDelayTimer); playDelayTimer = null }
    if (!plyrRef || !playback.isLoaded) return
    if (s === 'playing') {
      // Wait for beamer countdown-done IPC — plyrPlay() fires from listener
    }
    else if (s === 'paused') plyrRef.pause()
    else if (s === 'loaded' || s === 'idle') { try { plyrRef.stop() } catch {} }
  })

  // Reset transcoding state BEFORE the DOM update so {#if transcodedPath}
  // never renders with a stale value from the previous song.
  $effect.pre(() => {
    plyrSong  // track plyrSong changes (playback.song when loaded, else player.song)
    untrack(() => {
      const prev = transcodedPath
      transcodedPath = null
      transcoding = false
      transcodeError = null
      if (prev) deleteTempFile(prev).catch(() => {})
    })
  })

  $effect(() => {
    const song = plyrSong
    if (!song) return
    if (song.videoPath && needsTranscode(song.videoPath)) {
      transcoding = true
      transcodeToMp4(song.videoPath)
        .then(p => {
          if (plyrSong !== song) return  // song changed while transcoding — discard
          transcodedPath = p
          transcoding = false
        })
        .catch(e => {
          if (plyrSong !== song) return
          transcodeError = String(e)
          transcoding = false
        })
    }
  })

  function plyrYoutubeAction(node: HTMLDivElement, youtubeId: string) {
    const instance = new Plyr(node, {
      controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume'],
      autoplay: false,
    })
    playback.registerTimeProvider(() => instance.currentTime)
    plyrRef = instance
    console.log('[PlayerWidget] plyrYoutubeAction mounted — audio source: YouTube', plyrSong?.youtubeId)
    // countdown-done IPC will trigger plyrPlay() when beamer countdown finishes (only if playback.isLoaded)

    return {
      destroy() {
        if (playDelayTimer) { clearTimeout(playDelayTimer); playDelayTimer = null }
        playback.unregisterTimeProvider()
        plyrRef = null
        try { instance.destroy() } catch {}
      },
    }
  }

  // Svelte action — attached to the media element itself so Plyr lifecycle
  // is tied to element lifetime, not component effects.
  function plyrAction(
    node: HTMLAudioElement | HTMLVideoElement,
    params: { song: Song; type: 'audio' | 'video'; src?: string; poster?: string | null }
  ) {
    const instance = new Plyr(node, {
      controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume'],
      autoplay: false,
      resetOnEnd: true,
    })

    // Only register as time provider when mounted as the game audio (not preview player)
    if (playback.isLoaded) playback.registerTimeProvider(() => instance.currentTime)
    plyrRef = instance
    console.log('[PlayerWidget] plyrAction mounted — isLoaded:', playback.isLoaded)

    function mimeForPath(path: string): string {
      const ext = path.split('.').pop()?.toLowerCase() ?? ''
      const map: Record<string, string> = {
        mp3: 'audio/mpeg', m4a: 'audio/mp4',
        mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime',
        webm: 'video/webm',
      }
      return map[ext] ?? (params.type === 'audio' ? 'audio/mpeg' : 'video/mp4')
    }

    function load(p: { song: Song; type: 'audio' | 'video'; src?: string; poster?: string | null }) {
      const filePath = p.src ?? (p.type === 'audio' ? p.song.audioPath : p.song.videoPath)
      if (!filePath) return
      if (filePath === loadedSrc) return  // poster-only update — skip reload
      loadedSrc = filePath
      const src = toAssetUrl(filePath)
      const type = mimeForPath(filePath)
      instance.source = {
        type: p.type,
        sources: [{ src, type }],
        ...(p.type === 'video' && p.poster ? { poster: p.poster } : {}),
      }
    }

    let loadedSrc: string | undefined
    load(params)
    console.log('[PlayerWidget] plyrAction mounted — audio source:', params.type, '→', params.src ?? (params.type === 'audio' ? params.song.audioPath : params.song.videoPath))

    instance.on('error', () => {
      console.warn('[PlayerWidget] media load error — format may be unsupported')
    })

    return {
      update(newParams: { song: Song; type: 'audio' | 'video'; src?: string; poster?: string | null }) {
        load(newParams)
      },
      destroy() {
        if (playDelayTimer) { clearTimeout(playDelayTimer); playDelayTimer = null }
        playback.unregisterTimeProvider()
        plyrRef = null
        try { instance.destroy() } catch {}
      },
    }
  }

  function addToQueue() {
    if (player.song) songQueue.add(player.song)
  }

  function loadIntoPlayer() {
    if (player.song && playback.canLoad) playback.load(player.song)
  }
</script>

<div class="player-widget">
  {#if player.song}
    <div class="media-area">
      {#key plyrSong}
      {#if mediaType === 'video' && plyrSong?.videoPath}
        {#if needsTranscode(plyrSong.videoPath)}
          {#if transcoding}
            <!-- Converting MPEG-2/AVI → MP4, usually takes 1-3 seconds -->
            <div class="transcode-overlay">
              <span class="transcode-spinner"></span>
              <span class="transcode-label">Converting video…</span>
            </div>
          {:else if transcodeError}
            <div class="transcode-overlay transcode-error">
              <span>⚠ {transcodeError}</span>
            </div>
          {:else if transcodedPath}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video use:plyrAction={{ song: plyrSong, type: 'video', src: transcodedPath, poster: coverSrc }} playsinline></video>
          {/if}
        {:else}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video use:plyrAction={{ song: plyrSong, type: 'video', poster: coverSrc }} playsinline></video>
        {/if}

      {:else if mediaType === 'youtube' && plyrSong?.youtubeId}
        <div
          class="yt-embed"
          data-plyr-provider="youtube"
          data-plyr-embed-id={plyrSong.youtubeId}
          use:plyrYoutubeAction={plyrSong.youtubeId}
        ></div>

      {:else if mediaType === 'audio' && plyrSong?.audioPath}
        <div class="audio-backdrop">
          <img class="cover-img" src={coverSrc} alt="cover" />
          <audio use:plyrAction={{ song: plyrSong, type: 'audio' }}></audio>
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
      {/key}
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
        <span class="icon">queue_music</span>
        Add to Queue
      </button>
      <button class="btn btn-tonal" onclick={loadIntoPlayer} disabled={!playback.canLoad}>
        <span class="icon">play_circle</span>
        Load
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

  /* Shown while FFmpeg is transcoding the MPG/AVI file */
  .transcode-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    background: rgba(0, 0, 0, 0.8);
    color: var(--md-sys-color-on-surface);
  }

  .transcode-error {
    color: var(--md-sys-color-error);
  }

  .transcode-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(255,255,255,0.2);
    border-top-color: var(--md-sys-color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .transcode-label {
    font-size: var(--text-sm);
    opacity: 0.8;
  }

  .media-area video,
  .media-area :global(.plyr),
  .media-area :global(.plyr__video-wrapper),
  .media-area :global(.plyr__video-wrapper video) {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain;
  }

  .audio-backdrop {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .cover-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .audio-backdrop :global(.plyr--audio) {
    width: 100%;
  }

  .yt-embed {
    width: 100%;
    height: 100%;
  }
  :global(.yt-embed .plyr),
  :global(.yt-embed .plyr iframe) {
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

  .actions {
    display: flex;
    flex-direction: row;
    gap: var(--space-2);
  }

  .actions .btn {
    flex: 1;
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
