/**
 * USDB store — credentials, catalog cache, sync state.
 * Catalog is persisted to localStorage as a JSON blob.
 */

import { usdbLogin, usdbFetchCatalog, type UsdbCatalogEntry } from '$lib/ipc/tauri'

const STORAGE_KEY = 'usdb_catalog_v1'
const MTIME_KEY   = 'usdb_last_mtime'
const IDS_KEY     = 'usdb_last_song_ids'
const CREDS_KEY   = 'usdb_credentials'

// ── Credentials (persisted) ───────────────────────────────────────────────────

interface UsdbCredentials { username: string; password: string }

function loadCredentials(): UsdbCredentials {
  try {
    const raw = localStorage.getItem(CREDS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { username: '', password: '' }
}

// ── Catalog cache (persisted) ─────────────────────────────────────────────────

function loadCatalog(): UsdbCatalogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveCatalog(entries: UsdbCatalogEntry[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* ignore */ }
}

function loadWatermark(): { lastMtime: number; lastSongIds: number[] } {
  try {
    const mtime = parseInt(localStorage.getItem(MTIME_KEY) ?? '0', 10) || 0
    const ids   = JSON.parse(localStorage.getItem(IDS_KEY) ?? '[]') as number[]
    return { lastMtime: mtime, lastSongIds: ids }
  } catch {
    return { lastMtime: 0, lastSongIds: [] }
  }
}

function saveWatermark(lastMtime: number, lastSongIds: number[]) {
  localStorage.setItem(MTIME_KEY, String(lastMtime))
  localStorage.setItem(IDS_KEY,   JSON.stringify(lastSongIds))
}

// ── Store ─────────────────────────────────────────────────────────────────────

const _creds   = $state<UsdbCredentials>(loadCredentials())
const _catalog = $state<UsdbCatalogEntry[]>(loadCatalog())

type SyncStatus = 'idle' | 'syncing' | 'error'

let _loggedIn    = $state(false)
let _syncStatus  = $state<SyncStatus>('idle')
let _syncError   = $state<string | null>(null)
let _syncFetched = $state(0)

export const usdbStore = {
  // ── Credentials ──────────────────────────────────────────────────────────
  get username()  { return _creds.username },
  get password()  { return _creds.password },
  get loggedIn()  { return _loggedIn },

  setCredentials(username: string, password: string) {
    _creds.username = username
    _creds.password = password
    _loggedIn = false
    try { localStorage.setItem(CREDS_KEY, JSON.stringify({ username, password })) } catch { /* ignore */ }
  },

  clearCredentials() {
    _creds.username = ''
    _creds.password = ''
    _loggedIn = false
    localStorage.removeItem(CREDS_KEY)
    this.clearCatalog()
  },

  // ── Login ─────────────────────────────────────────────────────────────────
  async login(): Promise<{ ok: boolean; error?: string }> {
    if (!_creds.username || !_creds.password) {
      return { ok: false, error: 'Username and password required' }
    }
    try {
      const ok = await usdbLogin(_creds.username, _creds.password)
      _loggedIn = ok
      if (!ok) return { ok: false, error: 'Wrong username or password' }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  },

  // ── Catalog ───────────────────────────────────────────────────────────────
  get catalog()      { return _catalog },
  get catalogCount() { return _catalog.length },
  get syncStatus()   { return _syncStatus },
  get syncError()    { return _syncError },
  get syncFetched()  { return _syncFetched },

  /** Full sync (force=true) or incremental (force=false). Requires logged-in session. */
  async syncCatalog(force = false): Promise<void> {
    if (_syncStatus === 'syncing') return
    if (!_loggedIn) { _syncError = 'Not logged in'; return }

    _syncStatus  = 'syncing'
    _syncError   = null
    _syncFetched = 0

    try {
      const { lastMtime, lastSongIds } = force ? { lastMtime: 0, lastSongIds: [] } : loadWatermark()
      const entries = await usdbFetchCatalog(lastMtime, lastSongIds)

      if (force || lastMtime === 0) {
        // Full sync: replace catalog
        _catalog.length = 0
        _catalog.push(...entries)
      } else {
        // Incremental: merge
        const updatedMap = new Map(entries.map(e => [e.songId, e]))
        for (let i = 0; i < _catalog.length; i++) {
          const updated = updatedMap.get(_catalog[i].songId)
          if (updated) { _catalog[i] = updated; updatedMap.delete(_catalog[i].songId) }
        }
        // Add truly new songs
        for (const e of updatedMap.values()) _catalog.push(e)
      }

      _syncFetched = entries.length

      // Update watermark
      if (_catalog.length > 0) {
        const maxMtime = Math.max(..._catalog.map(e => e.usdbMtime))
        const atMax    = _catalog.filter(e => e.usdbMtime === maxMtime).map(e => e.songId)
        saveWatermark(maxMtime, atMax)
      }

      saveCatalog([..._catalog])
      _syncStatus = 'idle'
    } catch (e) {
      _syncError  = String(e)
      _syncStatus = 'error'
    }
  },

  clearCatalog() {
    _catalog.length = 0
    saveCatalog([])
    saveWatermark(0, [])
  },
}
