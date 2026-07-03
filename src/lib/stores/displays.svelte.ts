/**
 * Displays store — tracks which singer windows are open and
 * which player IDs are assigned to each display.
 *
 * Display 1 always exists (label: 'beamer').
 * Display 2 is optional (label: 'beamer2'), available when ≥3 players are active.
 */

export interface DisplayConfig {
  id: 1 | 2
  label: string   // Tauri window label
  playerIds: number[]  // which player IDs show on this display
  open: boolean
}

const STORAGE_KEY = 'ultrastardj-displays'

function defaultDisplays(): DisplayConfig[] {
  return [
    { id: 1, label: 'beamer',  playerIds: [1, 2, 3, 4], open: false },
    { id: 2, label: 'beamer2', playerIds: [],            open: false },
  ]
}

function load(): DisplayConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DisplayConfig[]
      // always reset open state — windows don't survive app restarts
      return parsed.map(d => ({ ...d, open: false }))
    }
  } catch { /* ignore */ }
  return defaultDisplays()
}

function save(displays: DisplayConfig[]) {
  try {
    // don't persist open state
    localStorage.setItem(STORAGE_KEY, JSON.stringify(displays.map(d => ({ ...d, open: false }))))
  } catch { /* ignore */ }
}

let displays = $state<DisplayConfig[]>(load())

export const displaysStore = {
  get all() { return displays },

  get display1() { return displays[0] },
  get display2() { return displays[1] },

  setOpen(id: 1 | 2, open: boolean) {
    displays = displays.map(d => d.id === id ? { ...d, open } : d)
  },

  setPlayerIds(id: 1 | 2, playerIds: number[]) {
    displays = displays.map(d => d.id === id ? { ...d, playerIds } : d)
    save(displays)
  },

  /** Toggle a player on/off for a given display, ensuring no player appears on both. */
  togglePlayer(displayId: 1 | 2, playerId: number) {
    const current = displays.map(d => ({ ...d }))
    const target = current.find(d => d.id === displayId)!
    const other  = current.find(d => d.id !== displayId)!
    const alreadyOnTarget = target.playerIds.includes(playerId)
    if (alreadyOnTarget) {
      target.playerIds = target.playerIds.filter(p => p !== playerId)
    } else {
      target.playerIds = [...target.playerIds, playerId]
      other.playerIds  = other.playerIds.filter(p => p !== playerId)
    }
    displays = current
    save(displays)
  },

  /** Remove a player from all displays (e.g. when deactivated). */
  removePlayer(playerId: number) {
    displays = displays.map(d => ({ ...d, playerIds: d.playerIds.filter(p => p !== playerId) }))
    save(displays)
  },
}
