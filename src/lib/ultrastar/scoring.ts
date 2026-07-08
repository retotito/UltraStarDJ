/**
 * scoring.ts — UltraStar-compatible score calculation.
 *
 * Scoring rules:
 *   Normal note:     100 pts per correctly sung beat
 *   Golden note:     200 pts per correctly sung beat
 *   Rap note:        100 pts per beat (counted as correct when singing)
 *   Rap-golden note: 200 pts per beat
 *   Freestyle note:   0 pts
 *   Perfect line bonus: +1000 pts per line where ALL singable beats are correct
 */

import type { NoteType, NoteTrack } from '$lib/ultrastar/types'
import type { ProcessedBeat } from '$lib/audio/pitchSession.svelte'

/** Points per correct beat for each note type */
export const NOTE_BEAT_PTS: Record<NoteType, number> = {
  normal:      100,
  golden:      200,
  rap:         100,
  'rap-golden': 200,
  freestyle:   0,
}

export const LINE_BONUS_PTS = 1000

export interface ScoreResult {
  score:    number
  maxScore: number
}

/**
 * Compute the maximum achievable score for a track.
 * Counts all singable beats × note multiplier + one line bonus per line.
 */
export function calcMaxScore(track: NoteTrack): number {
  let max = 0
  for (const line of track.lines) {
    let lineHasSingable = false
    for (const note of line.notes) {
      if (note.type === 'freestyle') continue
      max += NOTE_BEAT_PTS[note.type] * note.lengthBeats
      lineHasSingable = true
    }
    if (lineHasSingable) max += LINE_BONUS_PTS
  }
  return max
}

/**
 * Calculate running score from accumulated processedBeats.
 * Awards line bonuses for lines where every singable beat was sung correctly.
 * Only awards a line bonus once all beats in the line appear in processedBeats.
 */
export function calcScore(processedBeats: ProcessedBeat[], track: NoteTrack): ScoreResult {
  if (!track) return { score: 0, maxScore: 0 }

  const maxScore = calcMaxScore(track)
  if (maxScore === 0) return { score: 0, maxScore: 0 }

  // Index processedBeats by beat number for O(1) lookup
  const beatMap = new Map<number, ProcessedBeat>()
  for (const pb of processedBeats) beatMap.set(pb.beat, pb)

  let score = 0

  for (const line of track.lines) {
    const singableBeats: Array<{ beat: number; noteType: NoteType }> = []

    for (const note of line.notes) {
      if (note.type === 'freestyle') continue
      for (let b = note.startBeat; b < note.startBeat + note.lengthBeats; b++) {
        singableBeats.push({ beat: b, noteType: note.type })
      }
    }

    // Per-beat points
    for (const { beat, noteType } of singableBeats) {
      const pb = beatMap.get(beat)
      if (pb?.correct) score += NOTE_BEAT_PTS[noteType]
    }

    // Line bonus: all singable beats are present AND correct
    if (
      singableBeats.length > 0 &&
      singableBeats.every(({ beat }) => beatMap.get(beat)?.correct === true)
    ) {
      score += LINE_BONUS_PTS
    }
  }

  return { score, maxScore }
}
