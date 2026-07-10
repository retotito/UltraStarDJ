/**
 * Songs store — reactive song library built from enabled sources.
 */

import type { Song } from '$lib/ultrastar/types'
import type { SongSource } from '$lib/stores/settings.svelte'
import { appSettings } from '$lib/stores/settings.svelte'
import { parseSongHeader } from '$lib/ultrastar/parser'
import { listTxtFiles, readFile, pathExists } from '$lib/ipc/tauri'

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

interface SongsState {
  songs: Song[]
  scanning: boolean
  scanningSourceId: string | null
  scanStatus: ScanStatus
  scanError: string | null
  /** sourceId → number of songs found */
  countBySource: Record<string, number>
}

const state = $state<SongsState>({
  songs: [],
  scanning: false,
  scanningSourceId: null,
  scanStatus: 'idle',
  scanError: null,
  countBySource: {}
})

export const songLibrary = {
  get songs()          { return state.songs },
  get scanning()          { return state.scanning },
  get scanningSourceId()   { return state.scanningSourceId },
  get scanStatus()         { return state.scanStatus },
  get scanError()      { return state.scanError },
  get countBySource()  { return state.countBySource },

  /** Scan all local-folder sources for counts + availability. Only enabled sources contribute songs to the library. */
  async scanSources(sources: SongSource[]) {
    const localSources = sources.filter(s => s.type === 'local-folder')

    // If no real sources at all, clear the library
    if (localSources.length === 0) {
      state.songs = []
      state.countBySource = {}
      state.scanStatus = 'idle'
      return
    }

    state.scanning = true
    state.scanStatus = 'scanning'
    state.scanError = null
    console.log(`[songs] scanning ${localSources.length} local source(s)…`)

    const librarySongs: Song[] = []
    const counts: Record<string, number> = {}

    try {
      for (const source of localSources) {
        if (!source.path) continue
        state.scanningSourceId = source.id

        // Check availability first
        let available = false
        try {
          available = await pathExists(source.path)
        } catch (e) {
          console.warn(`[songs] pathExists failed for ${source.path}:`, e)
          available = false
        }

        console.log(`[songs] source "${source.label}" (${source.path}) available=${available}`)
        appSettings.updateSourceAvailability(source.id, available)

        if (!available) {
          counts[source.id] = source.lastCount ?? 0
          continue
        }

        // Scan for songs
        let count = 0
        const sourceSongs: Song[] = []
        try {
          const files = await listTxtFiles(source.path)
          console.log(`[songs] found ${files.length} .txt files in "${source.label}"`)
          for (const txtPath of files) {
            try {
              const text = await readFile(txtPath)
              const song = parseSongHeader(txtPath, source.id, text)
              if (song) {
                sourceSongs.push(song)
                count++
              }
            } catch (e) {
              console.warn(`[songs] failed to read/parse ${txtPath}:`, e)
            }
          }
        } catch (e) {
          console.error(`[songs] readDir failed for "${source.label}":`, e)
        }

        counts[source.id] = count
        appSettings.updateSourceCount(source.id, count)

        // Only add to library if enabled
        if (source.enabled) {
          librarySongs.push(...sourceSongs)
        }
      }

      appSettings.save()
      state.songs = librarySongs
      state.countBySource = counts
      state.scanStatus = 'done'
      state.scanningSourceId = null
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
  },

  /**
   * Start a background poll that checks source availability every N seconds.
   * If a source goes unavailable its songs are removed from the library.
   * If it comes back, a full rescan is triggered.
   * Returns a cleanup function to stop polling.
   */
  startAvailabilityWatcher(getSourcesFn: () => SongSource[], intervalMs = 5000): () => void {
    const handle = setInterval(async () => {
      const sources = getSourcesFn().filter(s => s.type === 'local-folder')
      for (const source of sources) {
        if (!source.path) continue
        let nowAvailable = false
        try { nowAvailable = await pathExists(source.path) } catch { nowAvailable = false }

        const wasAvailable = source.available !== false // treat undefined as available
        if (nowAvailable === wasAvailable) continue

        console.log(`[songs] source "${source.label}" changed: available=${nowAvailable}`)
        appSettings.updateSourceAvailability(source.id, nowAvailable)

        if (!nowAvailable) {
          // Remove its songs immediately without a full rescan
          state.songs = state.songs.filter(s => s.sourceId !== source.id)
          const counts = { ...state.countBySource }
          delete counts[source.id]
          state.countBySource = counts
        } else {
          // Drive came back — rescan all sources
          await songLibrary.scanSources(getSourcesFn())
        }
      }
    }, intervalMs)
    return () => clearInterval(handle)
  }
}
