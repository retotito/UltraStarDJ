import { songbookStart, songbookStop, songbookUpdateSongs, type SongbookEntry } from '$lib/ipc/tauri'
import { songLibrary } from '$lib/stores/songs.svelte'

let _active = $state(false)
let _url = $state<string | null>(null)
let _loading = $state(false)

function toEntries(): SongbookEntry[] {
  return songLibrary.songs.map(s => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    year: s.year,
    language: s.language,
    genre: s.genre,
    usdbViews: s.usdbViews,
    sourceId: s.sourceId,
  }))
}

export const songbookStore = {
  get active() { return _active },
  get url() { return _url },
  get loading() { return _loading },

  async start() {
    if (_active) return
    _loading = true
    try {
      const url = await songbookStart(toEntries())
      _url = url
      _active = true
    } catch (e) {
      console.error('[songbook] start failed:', e)
    } finally {
      _loading = false
    }
  },

  async stop() {
    if (!_active) return
    try {
      await songbookStop()
    } catch (e) {
      console.error('[songbook] stop failed:', e)
    }
    _active = false
    _url = null
  },

  async toggle() {
    if (_active) await this.stop()
    else await this.start()
  },

  /** Call when the song library changes while server is running */
  async syncSongs() {
    if (!_active) return
    try {
      await songbookUpdateSongs(toEntries())
    } catch (e) {
      console.error('[songbook] syncSongs failed:', e)
    }
  },
}
