/**
 * Players store (Svelte 5 runes)
 * Manages 4 fixed player slots with mic assignment.
 * Persisted to localStorage (same pattern as settings store).
 */

import { displaysStore } from '$lib/stores/displays.svelte'
import { setMicMixGain } from '$lib/ipc/tauri'
import { storageKey } from '$lib/stores/storageKey'

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
  /**
   * Noise gate threshold 0.0–1.0 (fraction of full-scale amplitude).
   * Samples below this level are treated as silence — no pitch detection,
   * no audio output. Default 0.1 (10% amplitude, filters background noise).
   */
  threshold: number
  /**
   * Input gain multiplier 0.0–2.0. Applied before threshold check.
   * Use to boost quiet mics. Default 1.0 (unity gain).
   */
  inputGain: number
  /** Mic output mix volume 0.0–2.0, default 1.0 */
  mixGain: number
  /** Mic input latency in ms (0–500). Per-player, measured via latency test. */
  micDelayMs: number
}

const PLAYER_COLORS = ['blue', 'red', 'green', 'yellow'] as const

const DEFAULTS: PlayerConfig[] = [1, 2, 3, 4].map((id, i) => ({
  id: id as PlayerConfig['id'],
  active: id <= 2,
  name: `Player ${id}`,
  color: PLAYER_COLORS[i],
  mic: null,
  threshold: 0.1,
  inputGain: 1.0,
  mixGain: 1.0,
  micDelayMs: 40,
}))

let players = $state<PlayerConfig[]>(structuredClone(DEFAULTS))

// ── Runtime-only state (not persisted) ───────────────────────────────────────

/** Player IDs currently in mic-test mode */
let monitoringIds = $state<Set<number>>(new Set())

/** Per-player RMS level 0.0–1.0, updated by mic:level events */
let levels = $state<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 })

/** Player IDs whose mic is currently disconnected */
let disconnectedIds = $state<Set<number>>(new Set())

/** Player IDs whose mic output is muted (fader position preserved) */
let mutedIds = $state<Set<number>>(new Set())

// ─────────────────────────────────────────────────────────────────────────────

export const playersStore = {
  get all() { return players },
  get monitoringIds() { return monitoringIds },
  get levels() { return levels },
  get disconnectedIds() { return disconnectedIds },
  get mutedIds() { return mutedIds },

  /** A player is active when it has a mic assigned and is not disconnected */
  isActive(id: number): boolean {
    const p = players.find(p => p.id === id)
    if (!p) return false
    return p.mic !== null && !disconnectedIds.has(id)
  },

  getById(id: number): PlayerConfig | undefined {
    return players.find(p => p.id === id)
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
    // When mic is removed, also remove player from any display
    if (mic === null) displaysStore.removePlayer(id)
    playersStore.save()
  },

  setThreshold(id: number, threshold: number) {
    players = players.map(p => p.id === id ? { ...p, threshold: Math.round(threshold * 1000) / 1000 } : p)
    playersStore.save()
  },

  setInputGain(id: number, inputGain: number) {
    const clamped = Math.min(1.0, Math.max(0, Math.round(inputGain * 100) / 100))
    players = players.map(p => p.id === id ? { ...p, inputGain: clamped } : p)
    playersStore.save()
  },

  setMixGain(id: number, mixGain: number) {
    players = players.map(p => p.id === id ? { ...p, mixGain: Math.round(mixGain * 100) / 100 } : p)
    playersStore.save()
    setMicMixGain(id, mixGain).catch(() => {})
  },

  setMicDelayMs(id: number, ms: number) {
    players = players.map(p => p.id === id ? { ...p, micDelayMs: Math.round(ms) } : p)
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
    if (disconnected) {
      next.add(playerId)
      displaysStore.removePlayer(playerId)
    } else {
      next.delete(playerId)
    }
    disconnectedIds = next
  },

  toggleMute(id: number) {
    const next = new Set(mutedIds)
    if (next.has(id)) {
      next.delete(id)
      const p = players.find(p => p.id === id)
      setMicMixGain(id, p?.mixGain ?? 1.0).catch(() => {})
    } else {
      next.add(id)
      setMicMixGain(id, 0).catch(() => {})
    }
    mutedIds = next
  },

  load() {
    try {
      const raw = localStorage.getItem(storageKey('ultrastardj-players'))
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
      localStorage.setItem(storageKey('ultrastardj-players'), JSON.stringify(players))
    } catch {}
  },
}
