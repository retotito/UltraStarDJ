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
import type { NoteTrack, NoteType } from '$lib/ultrastar/types'
import { calcScore } from '$lib/ultrastar/scoring'

export interface ActivePlayer {
  playerId: number
  deviceId: string
  threshold?: number
  inputGain?: number
}

export interface ProcessedBeat {
  beat:         number
  midiNote:     number   // octave-corrected midi (same octave range as target)
  correct:      boolean
  isFirstInNote: boolean // true when this beat is the first beat of its note
  noteType:     NoteType
}

export interface PitchResult {
  playerId:       number
  midiNote:       number   // -1 = no pitch (latest raw sample)
  correct:        boolean
  rowPitch:       number   // note pitch to display in lane (-1 = hide)
  score:          number
  maxScore:       number
  /** All processed beats for current section: beat index → ProcessedBeat */
  processedBeats: ProcessedBeat[]
}

let detectors = new Map<number, PitchDetector>()

// Reactive: latest pitch result per playerId
let _notes = $state<Record<number, PitchResult>>({})

// processedBeats: playerId → (beat → ProcessedBeat)
// Accumulates one entry per integer beat. Cleared on stop()/start(). Overwritten each frame (last frame per beat wins).
const _processedBeats = new Map<number, Map<number, ProcessedBeat>>()
// Joker state per player: true = has one free "forgiven" beat banked (TunePerfect algorithm)
const _jokerState = new Map<number, boolean>()
// Throttle debug logging: track last logged beat per player
const _lastLoggedBeat = new Map<number, number>()

export const pitchSession = {
  get notes(): Record<number, PitchResult> { return _notes },



  async start(players: ActivePlayer[]): Promise<void> {
    await pitchSession.stop()
    _notes = {}
    _processedBeats.clear()
    _jokerState.clear()
    _lastLoggedBeat.clear()
    console.log('[pitchSession] start — players:', players.map(p => `P${p.playerId} dev:${p.deviceId}`))

    // Start detectors sequentially — parallel getUserMedia on macOS can cause
    // one stream to return silence when two devices are opened at the same time.
    for (const p of players) {
      const det = new PitchDetector(p.playerId, p.threshold ?? 0.1, p.inputGain ?? 1.0)
      detectors.set(p.playerId, det)
      try {
        await det.start(p.deviceId)
        // Ensure AudioContext is running (may start suspended on some platforms)
        console.log(`[pitchSession] P${p.playerId} mic started OK`)
      } catch (e) {
        console.warn(`[pitchSession] could not start mic for P${p.playerId}:`, e)
        detectors.delete(p.playerId)
      }
    }
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
      let activeNoteStart = -1
      let activeNoteType: NoteType = 'normal'
      for (const line of (track?.lines ?? [])) {
        for (const note of line.notes) {
          if (evalBeat >= note.startBeat && evalBeat < note.startBeat + note.lengthBeats) {
            targetPitch = note.pitch
            activeNoteStart = note.startBeat
            activeNoteType = note.type
          }
        }
      }

      let correct = false
      // Octave-corrected midi: shift sample to same octave range as target
      let correctedMidi = sample.midiNote
      if (sample.midiNote >= 0 && targetPitch >= 0) {
        const diff = Math.abs(sample.midiNote - targetPitch) % 12
        const distance = diff > 6 ? 12 - diff : diff
        correct = distance <= tolerance

        // Wrap sung note into same octave window as target (±6 semitones)
        while (correctedMidi > targetPitch + 6) correctedMidi -= 12
        while (correctedMidi < targetPitch - 6) correctedMidi += 12
      }

      // Joker system (TunePerfect algorithm):
      // — Correct beat  → bank a joker for next beat
      // — Wrong beat with joker → spend joker, treat as correct (forgives vibrato dips / brief misses)
      // — Wrong beat without joker → genuine miss
      // — No pitch → clear joker
      let jokerUsed = false
      if (sample.midiNote < 0) {
        _jokerState.set(playerId, false)
      } else if (correct) {
        _jokerState.set(playerId, true)
      } else if (_jokerState.get(playerId)) {
        _jokerState.set(playerId, false)
        correct = true
        jokerUsed = true
      } else {
        _jokerState.set(playerId, false)
      }

      // Snap display pitch to target when correct (so segments sit ON the note bar)
      const displayMidi = correct ? targetPitch : correctedMidi

      // Log pitch info for debugging (throttled: only on new integer beats)
      if (sample.midiNote >= 0) {
        const intBeat = Math.floor(evalBeat)
        const lastLogged = (_lastLoggedBeat.get(playerId) ?? -1)
        if (intBeat !== lastLogged) {
          _lastLoggedBeat.set(playerId, intBeat)
          console.log(
            `[pitch P${playerId}] beat=${intBeat}` +
            ` raw=${sample.midiNote}` +
            (targetPitch >= 0
              ? ` corrected=${correctedMidi} target=${targetPitch} correct=${correct}${jokerUsed ? ' (joker)' : ''} (difficulty=${difficulty} tol=±${tolerance}st)`
              : ' (no active note)')
          )
        }
      }

      // Record one ProcessedBeat per integer beat when we're inside a note
      if (sample.midiNote >= 0 && activeNoteStart >= 0) {
        const intBeat = Math.floor(evalBeat)
        if (!_processedBeats.has(playerId)) _processedBeats.set(playerId, new Map())
        const playerBeats = _processedBeats.get(playerId)!
        const isFirstInNote = intBeat === activeNoteStart
        playerBeats.set(intBeat, { beat: intBeat, midiNote: displayMidi, correct, isFirstInNote, noteType: activeNoteType })
      }

      // Collect all processedBeats for this player as an array (sent to beamer)
      const playerBeats = _processedBeats.get(playerId)
      const processedBeats: ProcessedBeat[] = playerBeats ? [...playerBeats.values()] : []

      // Compute running score
      const { score, maxScore } = calcScore(processedBeats, track)

      next[playerId] = {
        playerId,
        midiNote: sample.midiNote,
        correct,
        rowPitch: correct ? targetPitch : displayMidi,
        score,
        maxScore,
        processedBeats,
      }
    }

    _notes = next
  },

  async stop(): Promise<void> {
    await Promise.all([...detectors.values()].map(d => d.stop()))
    detectors.clear()
    _processedBeats.clear()
    _jokerState.clear()
    _lastLoggedBeat.clear()
    _notes = {}
  },
}
