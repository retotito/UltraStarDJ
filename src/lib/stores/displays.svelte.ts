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

import { sendScreenConfig } from '$lib/ipc/tauri'

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

  get display1() { return displays.find(d => d.id === 1)! },
  get display2() { return displays.find(d => d.id === 2)! },

  setOpen(id: 1 | 2, open: boolean) {
    const d = displays.find(x => x.id === id)!
    d.open = open
    console.log(`[displays] beamer${id} open=${open} players=[${d.playerIds}]`)
  },

  setPlayerIds(id: 1 | 2, playerIds: number[]) {
    const d = displays.find(x => x.id === id)!
    d.playerIds = playerIds
    save(displays)
  },

  /** Toggle a player on/off for a given display, ensuring no player appears on both. */
  togglePlayer(displayId: 1 | 2, playerId: number) {
    const target = displays.find(d => d.id === displayId)!
    const other  = displays.find(d => d.id !== displayId)!
    const idx = target.playerIds.indexOf(playerId)
    if (idx !== -1) {
      target.playerIds.splice(idx, 1)
    } else {
      target.playerIds.push(playerId)
      const otherIdx = other.playerIds.indexOf(playerId)
      if (otherIdx !== -1) other.playerIds.splice(otherIdx, 1)
    }
    save(displays)
    displaysStore._syncAll()
  },

  /** Remove a player from all displays (e.g. when deactivated). */
  removePlayer(playerId: number) {
    for (const d of displays) {
      const idx = d.playerIds.indexOf(playerId)
      if (idx !== -1) d.playerIds.splice(idx, 1)
    }
    save(displays)
    displaysStore._syncAll()
  },

  /** Send current playerIds to all open beamer windows. */
  _syncAll() {
    for (const d of displays) {
      if (d.open) {
        sendScreenConfig({ windowLabel: d.label, playerIds: [...d.playerIds].sort((a, b) => a - b) })
      }
    }
  },
}
