/**
 * Players store (Svelte 5 runes)
 * Manages 4 fixed player slots with mic assignment.
 * Persisted to localStorage (same pattern as settings store).
 */

export type MicChannel = 'left' | 'right' | 'mono'

export interface MicAssignment {
  deviceId: string
  channel: MicChannel
}

export interface PlayerConfig {
  id: 1 | 2 | 3 | 4
  active: boolean
  name: string
  /** Tailwind-style color key used for player accent, e.g. 'blue', 'red' */
  color: string
  mic: MicAssignment | null
  /** Software gain multiplier 0.0–2.0, default 1.0 */
  gain: number
}

const PLAYER_COLORS = ['blue', 'red', 'green', 'yellow'] as const

const DEFAULTS: PlayerConfig[] = [1, 2, 3, 4].map((id, i) => ({
  id: id as PlayerConfig['id'],
  active: id <= 2,
  name: `Player ${id}`,
  color: PLAYER_COLORS[i],
  mic: null,
  gain: 1.0,
}))

let players = $state<PlayerConfig[]>(structuredClone(DEFAULTS))

// ── Runtime-only state (not persisted) ───────────────────────────────────────

/** Player IDs currently in mic-test mode */
let monitoringIds = $state<Set<number>>(new Set())

/** Per-player RMS level 0.0–1.0, updated by mic:level events */
let levels = $state<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 })

/** Player IDs whose mic is currently disconnected */
let disconnectedIds = $state<Set<number>>(new Set())

// ─────────────────────────────────────────────────────────────────────────────

export const playersStore = {
  get all() { return players },
  get monitoringIds() { return monitoringIds },
  get levels() { return levels },
  get disconnectedIds() { return disconnectedIds },

  getById(id: number): PlayerConfig | undefined {
    return players.find(p => p.id === id)
  },

  setActive(id: number, active: boolean) {
    players = players.map(p => p.id === id ? { ...p, active } : p)
    playersStore.save()
  },

  setName(id: number, name: string) {
    players = players.map(p => p.id === id ? { ...p, name } : p)
    playersStore.save()
  },

  setColor(id: number, color: string) {
    players = players.map(p => p.id === id ? { ...p, color } : p)
    playersStore.save()
  },

  setMic(id: number, mic: MicAssignment | null) {
    players = players.map(p => p.id === id ? { ...p, mic } : p)
    playersStore.save()
  },

  setGain(id: number, gain: number) {
    players = players.map(p => p.id === id ? { ...p, gain: Math.round(gain * 100) / 100 } : p)
    playersStore.save()
  },

  setMonitoring(id: number, on: boolean) {
    const next = new Set(monitoringIds)
    if (on) next.add(id); else next.delete(id)
    monitoringIds = next
  },

  setLevel(playerId: number, rms: number) {
    levels = { ...levels, [playerId]: rms }
  },

  setDisconnected(playerId: number, disconnected: boolean) {
    const next = new Set(disconnectedIds)
    if (disconnected) next.add(playerId); else next.delete(playerId)
    disconnectedIds = next
  },

  load() {
    try {
      const raw = localStorage.getItem('ultrastardj-players')
      if (raw) {
        const saved: PlayerConfig[] = JSON.parse(raw)
        // Merge saved data onto defaults so new fields survive upgrades
        players = DEFAULTS.map(def => {
          const s = saved.find(p => p.id === def.id)
          return s ? { ...def, ...s } : def
        })
      }
    } catch {}
  },

  save() {
    try {
      localStorage.setItem('ultrastardj-players', JSON.stringify(players))
    } catch {}
  },
}
