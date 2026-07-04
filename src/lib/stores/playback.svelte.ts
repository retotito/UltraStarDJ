/**
 * Playback store — single source of truth for DJ transport state.
 * Wraps player store and fires IPC events to beamer windows.
 */

import type { Song } from '$lib/ultrastar/types'
import { player } from '$lib/stores/player.svelte'
import { displaysStore } from '$lib/stores/displays.svelte'
import { layout } from '$lib/stores/layout.svelte'
import { sendPlaySong, sendPreviewSong, sendPauseSong, sendResumeSong, sendStopSong, sendTimeTick, onBeamerReady } from '$lib/ipc/tauri'
import { readFile } from '$lib/ipc/tauri'
import { parseSongNotes } from '$lib/ultrastar/parser'
import { convertFileSrc } from '@tauri-apps/api/core'

export type PlaybackStatus = 'idle' | 'loaded' | 'preview' | 'playing' | 'paused'

interface PlaybackState {
  status: PlaybackStatus
  song: Song | null
}

let state = $state<PlaybackState>({ status: 'idle', song: null })
let showClearBeamers = $state(false)
let beamerReady = $state(true) // true when no beamers open or media is buffered

// Listen for beamer-ready events from beamer windows
onBeamerReady(() => { console.log('[playback] beamer-ready received — enabling play'); beamerReady = true })

// ── Time-tick loop ────────────────────────────────────────────
let getTime: (() => number) | null = null
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
  /** Can play only when a song is loaded, a beamer is open, AND beamer media is buffered */
  get canPlay()  { return (state.status === 'loaded' || state.status === 'preview') && (displaysStore.display1.open || displaysStore.display2.open) && beamerReady },
  get showClearBeamers() { return showClearBeamers },
  get beamerReady() { return beamerReady },
  get currentTime() { return _currentTime },

  /** Called by PlayerWidget to register how to get current playback time */
  registerTimeProvider(fn: () => number) { console.log('[playback] registerTimeProvider called'); getTime = fn },
  unregisterTimeProvider() { console.log('[playback] unregisterTimeProvider called'); getTime = null },

  /** Load a song into the player without starting playback */
  load(song: Song) {
    if (!playback.canLoad) return
    console.log('[playback] load() called, song:', song.title, 'audioPath:', song.audioPath, 'videoPath:', song.videoPath)
    state = { status: 'loaded', song }
    showClearBeamers = false
    layout.showNowPlaying || layout.toggleNowPlaying()
  },

  /** Send preview-song to beamers — show get-ready screen without starting audio */
  async preview() {
    if (!state.song || !playback.canPlay) return
    const song = state.song
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
    startTick()
    const assetBase = convertFileSrc('')

    // Parse notes on-demand if not already loaded
    if (!song.notes && song.txtPath) {
      try {
        const txt = await readFile(song.txtPath)
        song.notes = parseSongNotes(txt)
      } catch (e) {
        console.warn('[playback] failed to parse notes', e)
      }
    }

    for (const display of [displaysStore.display1, displaysStore.display2]) {
      if (display.open) {
        await sendPlaySong({
          song,
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
    stopTick()
    state.status = 'loaded'
    showClearBeamers = true
    await sendStopSong()
  },

  /** Send a second stop to clear the score screen and return beamers to idle */
  async clearBeamers() {
    showClearBeamers = false
    await sendStopSong()
  },

  dismiss() {
    state = { status: 'idle', song: null }
    showClearBeamers = false
  },
}
