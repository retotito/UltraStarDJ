import { songbookStart, songbookStop, songbookUpdateSongs, tunnelStart, tunnelStop, type SongbookEntry } from '$lib/ipc/tauri'
import { songLibrary } from '$lib/stores/songs.svelte'

let _active = $state(false)
let _url = $state<string | null>(null)
let _loading = $state(false)

let _tunnelActive = $state(false)
let _tunnelUrl = $state<string | null>(null)
let _tunnelPin = $state<string | null>(null)
let _tunnelLoading = $state(false)

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

  get tunnelActive() { return _tunnelActive },
  get tunnelUrl() { return _tunnelUrl },
  get tunnelPin() { return _tunnelPin },
  get tunnelLoading() { return _tunnelLoading },

  async start() {
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

  async startTunnel() {
    if (_tunnelActive) return
    _tunnelLoading = true
    try {
      const info = await tunnelStart(toEntries())
      _tunnelUrl = info.url
      _tunnelPin = info.pin
      _tunnelActive = true
      // Note: songbook server is started by Rust internally — don't set _active here
    } catch (e) {
      console.error('[tunnel] start failed:', e)
    } finally {
      _tunnelLoading = false
    }
  },

  async stopTunnel() {
    if (!_tunnelActive) return
    try {
      await tunnelStop()
    } catch (e) {
      console.error('[tunnel] stop failed:', e)
    }
    _tunnelActive = false
    _tunnelUrl = null
    _tunnelPin = null
  },

  async toggleTunnel() {
    if (_tunnelActive) await this.stopTunnel()
    else await this.startTunnel()
  },
}
