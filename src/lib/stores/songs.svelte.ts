/**
 * Songs store — reactive song library built from enabled sources.
 * Replaces mockSongs once real sources are added.
 */

import type { Song } from '$lib/ultrastar/types'
import type { SongSource } from '$lib/stores/settings.svelte'
import { parseSongHeader } from '$lib/ultrastar/parser'
import { listTxtFiles, readFile } from '$lib/ipc/tauri'
import { mockSongs } from '$lib/db/mockSongs'

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

interface SongsState {
  songs: Song[]
  scanning: boolean
  scanStatus: ScanStatus
  scanError: string | null
  /** sourceId → number of songs found */
  countBySource: Record<string, number>
}

const state = $state<SongsState>({
  songs: mockSongs,
  scanning: false,
  scanStatus: 'idle',
  scanError: null,
  countBySource: { mock: mockSongs.length }
})

export const songLibrary = {
  get songs()          { return state.songs },
  get scanning()       { return state.scanning },
  get scanStatus()     { return state.scanStatus },
  get scanError()      { return state.scanError },
  get countBySource()  { return state.countBySource },

  /** Scan all enabled local-folder sources and replace their songs in the library. */
  async scanSources(sources: SongSource[]) {
    const enabledLocal = sources.filter(s => s.type === 'local-folder' && s.enabled)

    // If no real sources, fall back to mock data
    if (enabledLocal.length === 0) {
      state.songs = mockSongs
      state.countBySource = { mock: mockSongs.length }
      state.scanStatus = 'idle'
      return
    }

    state.scanning = true
    state.scanStatus = 'scanning'
    state.scanError = null

    const scanned: Song[] = []
    const counts: Record<string, number> = {}

    try {
      for (const source of enabledLocal) {
        if (!source.path) continue
        let count = 0
        try {
          const files = await listTxtFiles(source.path)
          for (const txtPath of files) {
            try {
              const text = await readFile(txtPath)
              const song = parseSongHeader(txtPath, source.id, text)
              if (song) {
                scanned.push(song)
                count++
              }
            } catch {
              // skip unreadable file
            }
          }
        } catch {
          // skip unreadable directory
        }
        counts[source.id] = count
      }

      // Keep songs from disabled sources out; replace previous scan results
      const disabledIds = new Set(
        sources.filter(s => !s.enabled || s.type !== 'local-folder').map(s => s.id)
      )
      state.songs = scanned.filter(s => !disabledIds.has(s.sourceId))
      state.countBySource = counts
      state.scanStatus = 'done'
    } catch (err) {
      state.scanError = String(err)
      state.scanStatus = 'error'
    } finally {
      state.scanning = false
    }
  },

  /** Remove all songs belonging to a source (called on source removal). */
  removeBySouceId(sourceId: string) {
    state.songs = state.songs.filter(s => s.sourceId !== sourceId)
    const counts = { ...state.countBySource }
    delete counts[sourceId]
    state.countBySource = counts
  }
}
