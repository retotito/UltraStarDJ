/**
 * Song queue store (Svelte 5 runes)
 * The DJ's playlist — manually managed, manually started.
 */

import type { Song } from '$lib/ultrastar/types'

let queue = $state<Song[]>([])
let activeIndex = $state<number>(-1)

export const songQueue = {
  get items() { return queue },
  get activeIndex() { return activeIndex },
  get activeSong() { return activeIndex >= 0 ? queue[activeIndex] : null },

  add(song: Song) {
    queue = [...queue, song]
  },
  remove(songId: string) {
    const idx = queue.findIndex(s => s.id === songId)
    if (idx === -1) return
    queue = queue.filter(s => s.id !== songId)
    if (activeIndex >= idx) activeIndex = Math.max(activeIndex - 1, -1)
  },
  moveUp(songId: string) {
    const idx = queue.findIndex(s => s.id === songId)
    if (idx <= 0) return
    const next = [...queue]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    queue = next
  },
  moveDown(songId: string) {
    const idx = queue.findIndex(s => s.id === songId)
    if (idx === -1 || idx >= queue.length - 1) return
    const next = [...queue]
    ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
    queue = next
  },
  setActive(songId: string) {
    activeIndex = queue.findIndex(s => s.id === songId)
  },
  clear() {
    queue = []
    activeIndex = -1
  }
}
