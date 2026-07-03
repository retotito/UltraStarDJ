/**
 * Playback store — single source of truth for DJ transport state.
 * Wraps player store and fires IPC events to beamer windows.
 */

import type { Song } from '$lib/ultrastar/types'
import { displaysStore } from '$lib/stores/displays.svelte'
import { sendPlaySong, sendPauseSong, sendResumeSong, sendStopSong } from '$lib/ipc/tauri'
import { convertFileSrc } from '@tauri-apps/api/core'

export type PlaybackStatus = 'idle' | 'playing' | 'paused'

interface PlaybackState {
  status: PlaybackStatus
  song: Song | null
}

let state = $state<PlaybackState>({ status: 'idle', song: null })

export const playback = {
  get status() { return state.status },
  get song()   { return state.song },
  get isActive() { return state.status !== 'idle' },

  async play(song: Song) {
    state = { status: 'playing', song }
    const assetBase = convertFileSrc('')

    // Send to each open display with its own playerIds
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

  async stop() {
    state = { status: 'idle', song: null }
    await sendStopSong()
  },
}
