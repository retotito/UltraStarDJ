/**
 * pitchSession.svelte.ts
 *
 * Manages one PitchDetector per active player during song playback.
 * Exposes the latest smoothed MIDI note per player as reactive state.
 *
 * Usage:
 *   pitchSession.start(players)   — on countdown done
 *   pitchSession.sample()         — call each rAF frame; updates latestNotes
 *   pitchSession.stop()           — on song end / stop
 */

import { PitchDetector } from '$lib/audio/PitchDetector'
import { DIFFICULTY_TOLERANCE } from '$lib/stores/settings.svelte'
import type { Difficulty } from '$lib/stores/settings.svelte'
import type { NoteTrack } from '$lib/ultrastar/types'

export interface ActivePlayer {
  playerId: number
  deviceId: string
  threshold?: number
  inputGain?: number
}

export interface PitchResult {
  playerId:  number
  midiNote:  number   // -1 = no pitch
  correct:   boolean
  rowPitch:  number   // note pitch to display in lane (-1 = hide)
}

let detectors = new Map<number, PitchDetector>()

// Reactive: latest pitch result per playerId
let _notes = $state<Record<number, PitchResult>>({})

export const pitchSession = {
  get notes(): Record<number, PitchResult> { return _notes },

  async start(players: ActivePlayer[]): Promise<void> {
    await pitchSession.stop()
    _notes = {}
    console.log('[pitchSession] start — players:', players.map(p => `P${p.playerId} dev:${p.deviceId}`))

    await Promise.all(players.map(async p => {
      const det = new PitchDetector(p.playerId, p.threshold ?? 0.1, p.inputGain ?? 1.0)
      detectors.set(p.playerId, det)
      try {
        await det.start(p.deviceId)
        console.log(`[pitchSession] P${p.playerId} mic started OK`)
      } catch (e) {
        console.warn(`[pitchSession] could not start mic for P${p.playerId}:`, e)
        detectors.delete(p.playerId)
      }
    }))
  },

  /**
   * Sample all active detectors and update reactive notes.
   * Call once per rAF frame during playback.
   *
   * @param tracks    Song note tracks (for current-note lookup)
   * @param currentBeat  Current playback beat
   * @param difficulty   Tolerance level
   * @param micDelayMs   Global mic latency offset in ms (shifts beat comparison back)
   * @param songBpm      Song BPM (UltraStar quarter-BPM) for beat offset calculation
   */
  tick(tracks: NoteTrack[], currentBeat: number, difficulty: Difficulty, micDelayMs = 0, songBpm = 120): void {
    const tolerance = DIFFICULTY_TOLERANCE[difficulty]
    // Shift beat comparison back by mic latency
    const delayBeats = (micDelayMs / 1000) * (songBpm / 60) * 4
    const evalBeat = currentBeat - delayBeats
    const next: Record<number, PitchResult> = {}

    for (const [playerId, det] of detectors) {
      const sample = det.sample()

      // Find which NoteTrack belongs to this player
      const track = tracks.find(t => t.player === det.playerId - 1) ?? tracks[0]

      // Find the note active at evalBeat (delay-adjusted)
      let targetPitch = -1
      for (const line of (track?.lines ?? [])) {
        for (const note of line.notes) {
          if (evalBeat >= note.startBeat && evalBeat < note.startBeat + note.lengthBeats) {
            targetPitch = note.pitch
            break
          }
        }
        if (targetPitch >= 0) break
      }

      let correct = false
      if (sample.midiNote >= 0 && targetPitch >= 0) {
        const diff = Math.abs(sample.midiNote - targetPitch) % 12
        const distance = diff > 6 ? 12 - diff : diff
        correct = distance <= tolerance
      }

      next[playerId] = {
        playerId,
        midiNote: sample.midiNote,
        correct,
        rowPitch: correct ? targetPitch : sample.midiNote,
      }
    }

    _notes = next
  },

  async stop(): Promise<void> {
    await Promise.all([...detectors.values()].map(d => d.stop()))
    detectors.clear()
    _notes = {}
  },
}
