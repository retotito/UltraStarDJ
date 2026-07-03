/**
 * Player state store (Svelte 5 runes)
 * Tracks what song is loaded, playback state, and position.
 */

import type { Song } from '$lib/ultrastar/types'

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped'

export interface PlayerState {
  status: PlayerStatus
  song: Song | null
  positionMs: number
  durationMs: number
}

let state = $state<PlayerState>({
  status: 'idle',
  song: null,
  positionMs: 0,
  durationMs: 0
})

export const player = {
  get status() { return state.status },
  get song() { return state.song },
  get positionMs() { return state.positionMs },
  get durationMs() { return state.durationMs },

  load(song: Song) {
    state = { status: 'loading', song, positionMs: 0, durationMs: 0 }
  },
  clear() {
    state = { status: 'idle', song: null, positionMs: 0, durationMs: 0 }
  },
  play() {
    if (state.song) state.status = 'playing'
  },
  pause() {
    if (state.status === 'playing') state.status = 'paused'
  },
  stop() {
    state = { status: 'stopped', song: state.song, positionMs: 0, durationMs: 0 }
  },
  setPosition(ms: number) {
    state.positionMs = ms
  },
  setDuration(ms: number) {
    state.durationMs = ms
  }
}
