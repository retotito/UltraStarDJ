<script lang="ts">
  import Plyr from 'plyr'
  import 'plyr/dist/plyr.css'
  import { untrack } from 'svelte'
  import { player } from '$lib/stores/player.svelte'
  import { songQueue } from '$lib/stores/queue.svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import { network } from '$lib/stores/network.svelte'
  import { toAssetUrl, needsTranscode, transcodeToMp4, deleteTempFile, usdbGetSongTxt } from '$lib/ipc/tauri'
  import { validateSong } from '$lib/ultrastar/validate_song'
  import { enrichUsdbSong, requiresInternet } from '$lib/ultrastar/usdb-load'
  import { tooltip } from '$lib/tooltip'
  import { errorStore } from '$lib/stores/error.svelte'
  import placeholderSrc from '$lib/assets/song-placeholder.svg'
  import type { Song } from '$lib/ultrastar/types'
  import HorizontalFader from '$components/ui/HorizontalFader.svelte'
  import SongFader from '$components/ui/SongFader.svelte'
  import { previewChannel } from '$lib/audio/channels.svelte'

  type MediaType = 'video' | 'youtube' | 'audio' | 'none'

  const mediaType = $derived.by((): MediaType => {
    const s = player.song
    if (!s) return 'none'
    if (s.videoPath) return 'video'          // show video if available (preview player prefers visual)
    if (s.youtubeId && network.isOnline) return 'youtube'
    if (s.audioPath) return 'audio'          // audio-only fallback
    return 'none'
  })

  const coverSrc = $derived(
    player.song?.coverPath ? toAssetUrl(player.song.coverPath) : placeholderSrc
  )

  const isOfflineYoutube = $derived(
    !!player.song && requiresInternet(player.song) && !network.isOnline
  )

  // Transcoded temp file state
  let transcodedPath = $state<string | null>(null)
  let transcoding = $state(false)
  let transcodeError = $state<string | null>(null)

  // Reset transcoding state before DOM update when song changes
  $effect.pre(() => {
    player.song
    untrack(() => {
      const prev = transcodedPath
      transcodedPath = null
      transcoding = false
      transcodeError = null
      if (prev) deleteTempFile(prev).catch(() => {})
    })
  })

  $effect(() => {
    const song = player.song
    if (!song) return
    if (song.videoPath && needsTranscode(song.videoPath)) {
      transcoding = true
      transcodeToMp4(song.videoPath)
        .then(p => {
          if (player.song !== song) return
          transcodedPath = p
          transcoding = false
        })
        .catch(e => {
          if (player.song !== song) return
          transcodeError = String(e)
          transcoding = false
        })
    }
  })

  // Plyr action — YouTube embed (preview only)
  function plyrYoutubeAction(node: HTMLDivElement, youtubeId: string) {
    const instance = new Plyr(node, {
      controls: ['play', 'progress', 'current-time', 'duration'],
      autoplay: false,
    })
    // Set lowest quality once the IFrame player is ready (preview — no need for HD)
    instance.once('ready', () => {
      try {
        const yt = (instance as any).getInternalPlayer()
        yt?.setPlaybackQuality?.('tiny')
      } catch {}
    })
    return {
      destroy() { try { instance.destroy() } catch {} },
    }
  }

  function plyrAction(
    node: HTMLAudioElement | HTMLVideoElement,
    params: { song: Song; type: 'audio' | 'video'; src?: string; poster?: string | null }
  ) {
    const instance = new Plyr(node, {
      controls: ['play', 'progress', 'current-time', 'duration'],
      autoplay: false,
      resetOnEnd: true,
    })

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
      if (filePath === loadedSrc) return
      loadedSrc = filePath
      instance.source = {
        type: p.type,
        sources: [{ src: toAssetUrl(filePath), type: mimeForPath(filePath) }],
        ...(p.type === 'video' && p.poster ? { poster: p.poster } : {}),
      }
    }

    let loadedSrc: string | undefined
    load(params)

    instance.on('error', () => console.warn('[PreviewPlayer] media load error'))

    // Connect to Web Audio on first play via Plyr's event system.
    // Using instance.on() because Plyr intercepts native media events.
    let channelConnected = false
    instance.on('playing', () => {
      const media = instance.media as HTMLMediaElement | null
      const el = media ?? node
      const src = el.currentSrc || el.src
      if (!src || src.includes('blank') || src.includes('cdn.plyr.io')) return
      if (channelConnected) return
      channelConnected = true
      previewChannel.connectElement(el).catch(e => console.warn('[PlayerWidget] previewChannel connect failed', e))
    })

    return {
      update(p: { song: Song; type: 'audio' | 'video'; src?: string; poster?: string | null }) {
        channelConnected = false  // reset so reconnect happens on next play after song change
        load(p)
      },
      destroy() {
        previewChannel.disconnect()
        try { instance.destroy() } catch {}
      },
    }
  }

  async function addToQueue() {
    console.log('[PlayerWidget] addToQueue clicked, song:', player.song?.title)
    const song = player.song
    if (!song) return
    if (isOfflineYoutube) {
      errorStore.show('You\'re offline', ['This song requires a YouTube connection and cannot be queued without internet.'])
      return
    }
    try {
      const enriched = song.usdbId ? await enrichUsdbSong(song) : song
      const result = await validateSong(enriched)
      if (!result.valid) { errorStore.show('Song cannot be loaded', result.errors.map(e => e.message)); return }
      songQueue.add(result.song)
    } catch (e) {
      console.error('[PlayerWidget] addToQueue error:', e)
      errorStore.show('Failed to add USDB song', [String(e)])
    }
  }

  async function loadIntoPlayer() {
    console.log('[PlayerWidget] loadIntoPlayer clicked, song:', player.song?.title, 'canLoad:', playback.canLoad)
    let song = player.song
    if (!song || !playback.canLoad) {
      console.warn('[PlayerWidget] loadIntoPlayer blocked — song:', !!song, 'canLoad:', playback.canLoad)
      return
    }
    if (isOfflineYoutube) {
      errorStore.show('You\'re offline', ['This song requires a YouTube connection and cannot be played without internet.'])
      return
    }
    const t = performance.now().toFixed(0)
    console.log(`[PlayerWidget ${t}ms] loadIntoPlayer() — song:${song.title}`)
    try {
      if (song.usdbId) song = await enrichUsdbSong(song)
      const result = await validateSong(song)
      if (!result.valid) { errorStore.show('Song cannot be loaded', result.errors.map(e => e.message)); return }
      await playback.load(result.song)
    } catch (e) {
      console.error('[PlayerWidget] loadIntoPlayer error:', e)
      errorStore.show('Failed to load USDB song', [String(e)])
    }
  }
</script>

<div class="player-widget">
  {#if player.song}
    <div class="media-area">
      {#key player.song}
      {#if mediaType === 'video' && player.song.videoPath}
        {#if needsTranscode(player.song.videoPath)}
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
            <video use:plyrAction={{ song: player.song, type: 'video', src: transcodedPath, poster: coverSrc }} playsinline></video>
          {/if}
        {:else}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video use:plyrAction={{ song: player.song, type: 'video', poster: coverSrc }} playsinline></video>
        {/if}

      {:else if mediaType === 'youtube' && player.song.youtubeId}
        <div
          class="yt-embed"
          data-plyr-provider="youtube"
          data-plyr-embed-id={player.song.youtubeId}
          use:plyrYoutubeAction={player.song.youtubeId}
        ></div>

      {:else if mediaType === 'audio' && player.song.audioPath}
        <div class="audio-backdrop">
          <img class="cover-img" src={coverSrc} alt="cover" />
          <audio use:plyrAction={{ song: player.song, type: 'audio' }}></audio>
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
    </div>

    <div class="preview-fader">
      <SongFader label="Preview" level={previewChannel.level} gain={previewChannel.gain} ongainchange={(v) => previewChannel.setGain(v)} />
    </div>

    <div class="actions">
      <button class="btn btn-tonal" onclick={addToQueue}>
        <span class="icon">queue_music</span>
        Add to Queue
      </button>
      <button class="btn btn-tonal" onclick={loadIntoPlayer} disabled={!playback.canLoad}
        use:tooltip={!playback.canLoad ? (playback.status === 'playing' ? 'Song is playing — stop it first' : 'Song is paused — stop it first') : undefined}>
        <span class="icon">play_circle</span>
        Load
      </button>
    </div>
  {:else}
    <div class="empty-placeholder">
      <span class="icon icon_placehoder">music_note</span>
    </div>
    <p class="text-muted text-sm">Select a song to preview</p>
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

  .preview-fader {
    padding: 0 var(--space-1);
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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: var(--radius-md);
    object-fit: cover;
    background-color: rgb(41, 41, 41);
  }
  .icon_placehoder {
    font-size: 48px;
    color: rgb(191, 191, 191);
  }
</style>
