/**
 * Playback store — single source of truth for DJ transport state.
 * Wraps player store and fires IPC events to beamer windows.
 */

import type { Song } from '$lib/ultrastar/types'
import { displaysStore } from '$lib/stores/displays.svelte'
import { layout } from '$lib/stores/layout.svelte'
import { sendPlaySong, sendPreviewSong, sendPauseSong, sendResumeSong, sendStopSong, sendTimeTick, onBeamerReady, onCountdownDone } from '$lib/ipc/tauri'
import { readFile, needsTranscode, transcodeToMp4, deleteTempFile } from '$lib/ipc/tauri'
import { parseSongNotes } from '$lib/ultrastar/parser'
import { convertFileSrc } from '@tauri-apps/api/core'

export type PlaybackStatus = 'idle' | 'loaded' | 'preview' | 'playing' | 'paused'

interface PlaybackState {
  status: PlaybackStatus
  song: Song | null
}

let state = $state<PlaybackState>({ status: 'idle', song: null })
let showClearBeamers = $state(false)
let beamerReady = $state(true)
let isBuffering = $state(false)
let isCountingDown = $state(false)
let _transcodedPath: string | null = null  // temp MP4 to delete on dismiss

// Listen for beamer-ready events from beamer windows
onBeamerReady(() => {
  const t = performance.now().toFixed(0)
  console.log(`[playback ${t}ms] beamer-ready received — enabling play button`)
  beamerReady = true
})

// Clear countdown flag when beamer fires countdown-done
onCountdownDone(() => { isCountingDown = false })

// ── Time-tick loop ────────────────────────────────────────────
let getTime: (() => number) | null = null
let _timeProviderToken: string | null = null
let tickInterval: ReturnType<typeof setInterval> | null = null
let _currentTime = $state(0)

function startTick() {
  if (tickInterval) return
  console.log('[playback] startTick — getTime registered:', getTime !== null)
  tickInterval = setInterval(() => {
    if (getTime) {
      _currentTime = getTime()
      // log every ~1s
      if (Math.round(_currentTime * 10) % 10 === 0) console.log('[playback] tick currentTime:', _currentTime)
      sendTimeTick(_currentTime)
    } else {
      console.warn('[playback] tick fired but getTime is null')
    }
  }, 100)
}

function stopTick() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null }
}

export const playback = {
  get status() { return state.status },
  get song()   { return state.song },
  /** Bar is visible whenever a song is loaded (even if not playing) */
  get isLoaded() { return state.song !== null },
  /** True only while actively playing or paused */
  get isActive() { return state.status === 'playing' || state.status === 'paused' },
  /** Cannot load a new song while playing or paused */
  get canLoad()  { return state.status === 'idle' || state.status === 'loaded' || state.status === 'preview' },
  /** Can play only when a song is loaded, a beamer is open, video is buffered, AND beamer is ready */
  get canPlay()  { return (state.status === 'loaded' || state.status === 'preview') && (displaysStore.display1.open || displaysStore.display2.open) && beamerReady && !isBuffering },
  get showClearBeamers() { return showClearBeamers },
  get beamerReady() { return beamerReady },
  get isBuffering() { return isBuffering },
  get isCountingDown() { return isCountingDown },
  get currentTime() { return _currentTime },

  /** Called by VideoPreloader when video canplaythrough fires */
  setBufferingDone() {
    const t = performance.now().toFixed(0)
    console.log(`[playback ${t}ms] setBufferingDone — video ready, enabling buttons`)
    isBuffering = false
  },

  /** Called by GameAudio/GameYouTube to register how to get current playback time.
   * token identifies the owner — unregister only works when the same token matches. */
  registerTimeProvider(fn: () => number, token: string) {
    console.log(`[playback] registerTimeProvider called — token:${token}`)
    getTime = fn
    _timeProviderToken = token
  },
  unregisterTimeProvider(token: string) {
    if (_timeProviderToken !== token) {
      console.log(`[playback] unregisterTimeProvider ignored — token:${token} active:${_timeProviderToken}`)
      return
    }
    console.log(`[playback] unregisterTimeProvider called — token:${token}`)
    getTime = null
    _timeProviderToken = null
  },

  /** Load a song into the player without starting playback */
  async load(song: Song) {
    if (!playback.canLoad) return
    // Clean up any previous transcoded temp file
    if (_transcodedPath) { deleteTempFile(_transcodedPath).catch(() => {}); _transcodedPath = null }

    // Block buttons for the entire load sequence (transcode + buffer)
    isBuffering = !!(song.videoPath)
    beamerReady = true

    // Transcode unsupported video formats (MPG, AVI, MKV…) to MP4 before buffering
    if (song.videoPath && needsTranscode(song.videoPath)) {
      const t = performance.now().toFixed(0)
      console.log(`[playback ${t}ms] load() transcoding ${song.videoPath}`)
      try {
        const tempPath = await transcodeToMp4(song.videoPath)
        _transcodedPath = tempPath
        song = { ...song, videoPath: tempPath }
        console.log(`[playback ${performance.now().toFixed(0)}ms] load() transcode done → ${tempPath}`)
      } catch (e) {
        console.error('[playback] transcode failed:', e)
        isBuffering = false
        // Proceed without video — song still playable with audio only
        song = { ...song, videoPath: undefined }
      }
    }

    const t = performance.now().toFixed(0)
    console.log(`[playback ${t}ms] load() song:"${song.title}" videoPath:${song.videoPath ?? 'none'} → isBuffering=${isBuffering}`)
    state = { status: 'loaded', song }
    showClearBeamers = false
    layout.showNowPlaying || layout.toggleNowPlaying()
  },

  /** Send preview-song to beamers — show get-ready screen without starting audio */
  async preview() {
    if (!state.song || !playback.canPlay) return
    const song = state.song
    // Video songs need to buffer on beamer — show spinner until canplaythrough fires
    if (song.videoPath) {
      beamerReady = false
      const t = performance.now().toFixed(0)
      console.log(`[playback ${t}ms] preview() video song — beamerReady=false, waiting for canplaythrough`)
    }
    state.status = 'preview'
    const assetBase = convertFileSrc('')
    for (const display of [displaysStore.display1, displaysStore.display2]) {
      if (display.open) {
        await sendPreviewSong({
          song,
          assetBase,
          playerIds: [...display.playerIds].sort((a, b) => a - b),
          windowLabel: display.label,
        })
      }
    }
  },

  /** Start playback of the currently loaded song */
  async play() {
    if ((state.status !== 'loaded' && state.status !== 'preview') || !state.song) return
    const song = state.song
    state.status = 'playing'
    isCountingDown = true
    startTick()
    const assetBase = convertFileSrc('')

    // Parse notes on-demand if not already loaded
    if (!song.notes && song.txtPath) {
      try {
        const txt = await readFile(song.txtPath)
        song.notes = parseSongNotes(txt)
        console.log(`[playback] play() notes parsed — tracks:${song.notes?.length} txtPath:${song.txtPath}`)
      } catch (e) {
        console.warn('[playback] failed to parse notes', e)
      }
    } else {
      console.log(`[playback] play() notes — already:${!!song.notes} txtPath:${song.txtPath}`)
    }

    for (const display of [displaysStore.display1, displaysStore.display2]) {
      if (display.open) {
        await sendPlaySong({
          song: $state.snapshot(song) as Song,
          assetBase,
          playerIds: [...display.playerIds].sort((a, b) => a - b),
          windowLabel: display.label,
        })
      }
    }
  },

  async pause() {
    if (state.status !== 'playing') return
    state.status = 'paused'
    isCountingDown = false
    stopTick()
    await sendPauseSong()
  },

  async resume() {
    if (state.status !== 'paused') return
    state.status = 'playing'
    startTick()
    await sendResumeSong()
  },

  /** Stop playback — song stays loaded in the bar */
  async stop() {
    if (state.status === 'idle') return
    isCountingDown = false
    stopTick()
    state.status = 'loaded'
    showClearBeamers = true
    await sendStopSong()
  },

  /** Send a second stop to clear the score screen and return beamers to idle */
  async clearBeamers() {
    showClearBeamers = false
    if (state.status === 'preview') state.status = 'loaded'
    await sendStopSong()
  },

  dismiss() {
    state = { status: 'idle', song: null }
    showClearBeamers = false
    getTime = null
    _timeProviderToken = null
    _currentTime = 0
    if (_transcodedPath) { deleteTempFile(_transcodedPath).catch(() => {}); _transcodedPath = null }
  },
}
