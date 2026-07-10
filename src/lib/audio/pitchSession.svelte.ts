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
  // Latest processed beat — only set when we're inside a note this frame
  beat:           number   // current integer beat (-1 = between notes)
  isFirstInNote:  boolean
  noteType:       string
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

  /** Suspend during pause — stops detectors but keeps processedBeats intact */
  async suspend(): Promise<void> {
    await Promise.all([...detectors.values()].map(d => d.stop()))
    detectors.clear()
    // Do NOT clear _processedBeats or _notes — preserve sung history across pause
    console.log('[pitchSession] suspended')
  },

  /** Resume after pause — restarts detectors but keeps accumulated processedBeats intact */
  async resume(players: ActivePlayer[]): Promise<void> {
    // Suspend first (detectors only) — do NOT call stop() as it clears _processedBeats
    await pitchSession.suspend()
    // Do NOT clear _processedBeats — preserve sung history across pause
    console.log('[pitchSession] resume — players:', players.map(p => `P${p.playerId} dev:${p.deviceId}`))
    for (const p of players) {
      const det = new PitchDetector(p.playerId, p.threshold ?? 0.1, p.inputGain ?? 1.0)
      detectors.set(p.playerId, det)
      try {
        await det.start(p.deviceId)
        console.log(`[pitchSession] P${p.playerId} mic resumed OK`)
      } catch (e) {
        console.warn(`[pitchSession] could not resume mic for P${p.playerId}:`, e)
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
   * @param micDelayMs   Unused (kept for compat) — use perPlayerDelays instead
   * @param songBpm      Song BPM (UltraStar quarter-BPM) for beat offset calculation
   * @param perPlayerDelays  Per-player mic delay overrides [{id, micDelayMs}]
   */
  tick(tracks: NoteTrack[], currentBeat: number, difficulty: Difficulty, micDelayMs = 0, songBpm = 120, perPlayerDelays: { id: number, micDelayMs: number }[] = []): void {
    const tolerance = DIFFICULTY_TOLERANCE[difficulty]
    const next: Record<number, PitchResult> = {}

    for (const [playerId, det] of detectors) {
      const sample = det.sample()
      // Per-player delay — fall back to global micDelayMs if not in perPlayerDelays
      const playerDelay = perPlayerDelays.find(p => p.id === playerId)?.micDelayMs ?? micDelayMs
      const delayBeats = (playerDelay / 1000) * (songBpm / 60) * 4
      const evalBeat = currentBeat - delayBeats

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
      if (activeNoteType === 'rap' || activeNoteType === 'rap-golden') {
        // Rap notes: any detected sound counts as correct — no pitch check
        correct = sample.midiNote >= 0
      } else if (sample.midiNote >= 0 && targetPitch >= 0) {
        const diff = Math.abs(sample.midiNote - targetPitch) % 12
        const distance = diff > 6 ? 12 - diff : diff
        correct = distance <= tolerance

        // Wrap sung note into same octave window as target (±6 semitones)
        while (correctedMidi > targetPitch + 6) correctedMidi -= 12
        while (correctedMidi < targetPitch - 6) correctedMidi += 12
      }

      // Joker system only applies to normal/golden notes, not rap
      const isRapNote = activeNoteType === 'rap' || activeNoteType === 'rap-golden'

      // Joker system (TunePerfect algorithm):
      // — Correct beat  → bank a joker for next beat
      // — Wrong beat with joker → spend joker, treat as correct (forgives vibrato dips / brief misses)
      // — Wrong beat without joker → genuine miss
      // — No pitch → clear joker
      let jokerUsed = false
      if (isRapNote) {
        // no joker for rap — correct is already final
      } else if (sample.midiNote < 0) {
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

      // Log pitch info per new integer beat
      if (sample.midiNote >= 0 && activeNoteStart >= 0) {
        const intBeat = Math.floor(evalBeat)
        const lastLogged = (_lastLoggedBeat.get(playerId) ?? -1)
        if (intBeat !== lastLogged) {
          // Detect skipped beats
          if (lastLogged >= 0 && intBeat > lastLogged + 1) {
            for (let s = lastLogged + 1; s < intBeat; s++) {
              console.log(`[pitch P${playerId}] beat=${s} → SKIPPED (tick missed)`)
            }
          }
          _lastLoggedBeat.set(playerId, intBeat)
          const syllable = (() => { for (const line of (track?.lines ?? [])) { const n = line.notes.find(n => intBeat >= n.startBeat && intBeat < n.startBeat + n.lengthBeats); if (n) return n.syllable?.trim() ?? '' } return '' })()
          const dist = targetPitch >= 0 ? Math.min(Math.abs(correctedMidi - targetPitch) % 12, 12 - Math.abs(correctedMidi - targetPitch) % 12) : -1
          const status = correct ? '✓ CORRECT' : `✗ WRONG (dist=${dist}st > tol=±${tolerance}st)`
          console.log(`[pitch P${playerId}] beat=${intBeat} "${syllable}" sung=${correctedMidi} target=${targetPitch} dist=${dist}st ${status}${jokerUsed ? ' (joker)' : ''}`)
        }
      } else if (sample.midiNote < 0) {
        // silence — reset last logged so next note starts fresh
        _lastLoggedBeat.set(playerId, -1)
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
      // Collect processedBeats internally for scoring (not sent to beamer)
      const processedBeatsForScore: ProcessedBeat[] = _processedBeats.get(playerId)
        ? [..._processedBeats.get(playerId)!.values()]
        : []

      // Compute running score
      const { score, maxScore } = calcScore(processedBeatsForScore, track)

      // Latest beat info for beamer (scalar only — no history)
      const intBeat = Math.floor(evalBeat)
      const isInsideNote = sample.midiNote >= 0 && activeNoteStart >= 0
      const isFirstInNote = intBeat === activeNoteStart

      next[playerId] = {
        playerId,
        midiNote: sample.midiNote,
        correct,
        rowPitch: correct ? targetPitch : displayMidi,
        score,
        maxScore,
        beat:          isInsideNote ? intBeat : -1,
        isFirstInNote: isInsideNote ? isFirstInNote : false,
        noteType:      activeNoteType,
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
