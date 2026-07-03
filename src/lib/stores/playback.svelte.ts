/**
 * Playback store — single source of truth for DJ transport state.
 * Wraps player store and fires IPC events to beamer windows.
 */

import type { Song } from '$lib/ultrastar/types'
import { displaysStore } from '$lib/stores/displays.svelte'
import { layout } from '$lib/stores/layout.svelte'
import { sendPlaySong, sendPauseSong, sendResumeSong, sendStopSong } from '$lib/ipc/tauri'
import { convertFileSrc } from '@tauri-apps/api/core'

export type PlaybackStatus = 'idle' | 'loaded' | 'playing' | 'paused'

interface PlaybackState {
  status: PlaybackStatus
  song: Song | null
}

let state = $state<PlaybackState>({ status: 'idle', song: null })

export const playback = {
  get status() { return state.status },
  get song()   { return state.song },
  /** Bar is visible whenever a song is loaded (even if not playing) */
  get isLoaded() { return state.song !== null },
  /** True only while actively playing or paused */
  get isActive() { return state.status === 'playing' || state.status === 'paused' },
  /** Cannot load a new song while playing or paused */
  get canLoad()  { return state.status === 'idle' || state.status === 'loaded' },
  /** Can only start playback when a song is loaded and at least one beamer is open */
  get canPlay()  { return state.status === 'loaded' && (displaysStore.display1.open || displaysStore.display2.open) },

  /** Load a song into the player without starting playback */
  load(song: Song) {
    if (!playback.canLoad) return
    state = { status: 'loaded', song }
    layout.showNowPlaying || layout.toggleNowPlaying()
  },

  /** Start playback of the currently loaded song */
  async play() {
    if (state.status !== 'loaded' || !state.song) return
    const song = state.song
    state.status = 'playing'
    const assetBase = convertFileSrc('')
    for (const display of [displaysStore.display1, displaysStore.display2]) {
      if (display.open) {
        await sendPlaySong({
          song,
          assetBase,
          playerIds: [...display.playerIds].sort((a, b) => a - b),
        })
      }
    }
  },

  async pause() {
    if (state.status !== 'playing') return
    state.status = 'paused'
    await sendPauseSong()
  },

  async resume() {
    if (state.status !== 'paused') return
    state.status = 'playing'
    await sendResumeSong()
  },

  /** Stop playback — song stays loaded in the bar */
  async stop() {
    if (state.status === 'idle') return
    state.status = 'loaded'
    await sendStopSong()
  },

  /** Send a second stop to clear the score screen and return beamers to idle */
  async clearBeamers() {
    await sendStopSong()
  },

  /** Dismiss the now-playing bar entirely */
  dismiss() {
    state = { status: 'idle', song: null }
  },

  /** Send a second stop to clear the score screen and return beamers to idle */
  async clearBeamers() {
    await sendStopSong()
  },
}
