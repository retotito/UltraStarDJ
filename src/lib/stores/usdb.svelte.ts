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

let _loggedIn      = $state(false)
let _syncStatus    = $state<SyncStatus>('idle')
let _syncError     = $state<string | null>(null)
let _syncFetched   = $state(0)
let _syncIsFullSync = $state(false)
const ESTIMATED_TOTAL = 27_000

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

  /** Attempt silent login with saved credentials (on app start). */
  async autoLogin(): Promise<boolean> {
    if (!_creds.username || !_creds.password) return false
    try {
      const ok = await usdbLogin(_creds.username, _creds.password)
      _loggedIn = ok
      return ok
    } catch {
      return false
    }
  },

  // ── Catalog ───────────────────────────────────────────────────────────────
  get catalog()        { return _catalog },
  get catalogCount()   { return _catalog.length },
  get syncStatus()     { return _syncStatus },
  get syncError()      { return _syncError },
  get syncFetched()    { return _syncFetched },
  get syncIsFullSync() { return _syncIsFullSync },
  /** 0–100 progress estimate for full sync; -1 for incremental (indeterminate) */
  get syncProgressPct(): number {
    if (_syncStatus !== 'syncing') return 0
    if (!_syncIsFullSync) return -1
    return Math.min(99, Math.round((_syncFetched / ESTIMATED_TOTAL) * 100))
  },

  /** Full sync (force=true) or incremental (force=false). Requires logged-in session. */
  async syncCatalog(force = false): Promise<void> {
    if (_syncStatus === 'syncing') return
    if (!_loggedIn) { _syncError = 'Not logged in'; return }

    _syncStatus     = 'syncing'
    _syncError      = null
    _syncFetched    = 0

    // If catalog is empty (failed to load from localStorage) treat as full sync
    const catalogEmpty = _catalog.length === 0
    const { lastMtime, lastSongIds } = (force || catalogEmpty)
      ? { lastMtime: 0, lastSongIds: [] }
      : loadWatermark()
    _syncIsFullSync = (force || catalogEmpty || lastMtime === 0)

    try {
      const entries = await usdbFetchCatalog(lastMtime, lastSongIds)
      console.log('[usdb] syncCatalog got', entries.length, 'entries, force=', force, 'lastMtime=', lastMtime)

      if (force || lastMtime === 0 || catalogEmpty) {
        // Full sync: replace catalog in chunks (avoid stack overflow with 27k entries)
        _catalog.length = 0
        const CHUNK = 1000
        for (let i = 0; i < entries.length; i += CHUNK) {
          _catalog.push(...entries.slice(i, i + CHUNK))
        }
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
      console.error('[usdb] syncCatalog error:', e)
    }
  },

  clearCatalog() {
    _catalog.length = 0
    saveCatalog([])
    saveWatermark(0, [])
  },
}
