<script lang="ts">
  import type { NoteTrack, LyricLine, Note } from '$lib/ultrastar/types'
  import type { PitchTickEntry } from '$lib/ipc/tauri'

  let { tracks, trackIndex = 0, playerColor = '#ffffff', currentTime, bpm, gap, rowCount = 16, showPianoRollLines = true, showNoteSyllables = true, noteBarStyle = 'white', noteBarMinHeight = 28, noteBarRadius = 4, pitchTick = null }: {
    tracks: NoteTrack[]
    trackIndex?: number
    playerColor?: string
    currentTime: number
    bpm: number
    gap: number     // ms
    rowCount?: number
    showPianoRollLines?: boolean
    showNoteSyllables?: boolean
    noteBarStyle?: 'white' | 'black'
    noteBarMinHeight?: number
    noteBarRadius?: number
    pitchTick?: PitchTickEntry | null
  } = $props()

  // ── Beat math ──────────────────────────────────────────────────────────────
  const currentBeat = $derived(
    (currentTime - gap / 1000) * (bpm / 60) * 4
  )

  const track = $derived(tracks[trackIndex] ?? null)

  // ── Active phrase ──────────────────────────────────────────────────────────
  /** Find the phrase currently being sung (or the next upcoming one) */
  const activeLine = $derived.by(() => {
    if (!track) return null
    // Find the phrase where currentBeat falls inside, with a small lookahead
    let upcoming: LyricLine | null = null
    for (const line of track.lines) {
      if (!line.notes.length) continue
      const first = line.notes[0].startBeat
      const last  = line.notes[line.notes.length - 1]
      const end   = last.startBeat + last.lengthBeats
      if (currentBeat >= first - 4 && currentBeat <= end + 4) return line
      if (currentBeat < first && !upcoming) upcoming = line
    }
    return upcoming
  })

  // ── Pitch → row mapping ────────────────────────────────────────────────────
  function avgPitch(line: LyricLine): number {
    const singable = line.notes.filter(n => n.type !== 'freestyle')
    if (!singable.length) return 0
    return singable.reduce((s, n) => s + n.pitch, 0) / singable.length
  }

  function pitchToRow(pitch: number, avg: number, rows: number): number {
    // Wrap pitch into the visible window via octave shifts
    let p = pitch
    const min = Math.floor(avg - rows / 2)
    const max = min + rows - 1
    while (p > max) p -= 12
    while (p < min) p += 12
    const offset = p - avg
    // row 1 = top (highest pitch), row N = bottom
    const row = Math.ceil(rows / 2 - offset)
    return Math.max(1, Math.min(rows, row))
  }

  // ── Grid geometry ──────────────────────────────────────────────────────────
  type NoteCell = {
    note: Note
    col: number       // 1-indexed grid column start
    colSpan: number
    row: number       // 1-indexed grid row
  }

  const cells = $derived.by((): NoteCell[] => {
    if (!activeLine) return []
    const firstBeat = activeLine.notes[0].startBeat
    const avg = avgPitch(activeLine)
    return activeLine.notes.map(note => ({
      note,
      col:     note.startBeat - firstBeat + 1,
      colSpan: Math.max(1, note.lengthBeats),
      row:     pitchToRow(note.pitch, avg, rowCount),
    }))
  })

  const phraseBeats = $derived.by(() => {
    if (!activeLine || !activeLine.notes.length) return 16
    const first = activeLine.notes[0].startBeat
    const last  = activeLine.notes[activeLine.notes.length - 1]
    return last.startBeat + last.lengthBeats - first
  })

  // ── Sung segments: group processedBeats into continuous runs ───────────────
  type SungSegment = {
    startCol:  number   // 1-indexed grid column
    length:    number   // span in beats
    row:       number   // 1-indexed grid row
    correct:   boolean
  }

  const sungSegments = $derived.by((): SungSegment[] => {
    if (!pitchTick?.processedBeats?.length || !activeLine) return []

    const phraseFirstBeat = activeLine.notes[0].startBeat
    const phraseLastBeat  = activeLine.notes[activeLine.notes.length - 1].startBeat
                          + activeLine.notes[activeLine.notes.length - 1].lengthBeats
    const avg = avgPitch(activeLine)

    // Filter to beats within current phrase only
    const beats = pitchTick.processedBeats
      .filter(b => b.beat >= phraseFirstBeat && b.beat < phraseLastBeat)
      .sort((a, b) => a.beat - b.beat)

    if (!beats.length) return []

    const segments: SungSegment[] = []
    for (const beat of beats) {
      const col = beat.beat - phraseFirstBeat + 1
      const row = pitchToRow(beat.midiNote, avg, rowCount)
      const last = segments.at(-1)

      const shouldStartNew =
        !last ||
        beat.isFirstInNote ||
        last.row !== row ||
        last.startCol + last.length !== col  // gap in beat sequence

      if (shouldStartNew) {
        segments.push({ startCol: col, length: 1, row, correct: beat.correct })
      } else {
        last.length++
        last.correct = last.correct || beat.correct  // segment is "correct" if any beat was correct
      }
    }
    return segments
  })

  // ── Perfect line flash ─────────────────────────────────────────────────────
  // Fires once per completed line where every singable beat was correct.
  let _evaluatedLineBeats = new Set<number>()   // plain JS — not reactive, no loop risk
  let perfectFlash = $state(false)

  $effect(() => {
    if (!pitchTick?.processedBeats || !track) {
      _evaluatedLineBeats.clear()
      return
    }
    const beatMap = new Map(pitchTick.processedBeats.map(b => [b.beat, b]))

    for (const line of track.lines) {
      if (!line.notes.length) continue
      const firstBeat = line.notes[0].startBeat
      const lastNote  = line.notes[line.notes.length - 1]
      const lineEnd   = lastNote.startBeat + lastNote.lengthBeats

      if (currentBeat < lineEnd) continue          // line not yet finished
      if (_evaluatedLineBeats.has(firstBeat)) continue  // already evaluated

      _evaluatedLineBeats.add(firstBeat)

      const singableBeats: number[] = []
      for (const note of line.notes) {
        if (note.type === 'freestyle') continue
        for (let b = note.startBeat; b < note.startBeat + note.lengthBeats; b++) {
          singableBeats.push(b)
        }
      }
      if (!singableBeats.length) continue

      const allCorrect = singableBeats.every(b => beatMap.get(b)?.correct === true)
      if (allCorrect) {
        perfectFlash = true
        setTimeout(() => { perfectFlash = false }, 1600)
      }
    }
  })
</script>

<div
  class="note-lane"
  style="
    --rows: {rowCount};
    --cols: {phraseBeats};
    --player-color: {playerColor};
    --bar-min-h: {noteBarMinHeight}px;
    --bar-radius: {noteBarRadius}px;
    --bar-bg:     {noteBarStyle === 'black' ? 'rgba(0,0,0,0.45)'   : 'rgba(255,255,255,0.18)'};
    --bar-border: {noteBarStyle === 'black' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.35)'};
  "
>
  {#each cells as cell (cell.note.startBeat + '_' + cell.note.pitch)}
    {@const isGolden = cell.note.type === 'golden'}
    {@const isRap = cell.note.type === 'rap' || cell.note.type === 'rap-golden'}
    {@const isFreestyle = cell.note.type === 'freestyle'}
    <div
      class="note-cell"
      style="
        grid-column: {cell.col} / span {cell.colSpan};
        grid-row: {cell.row};
      "
    >
      <div
        class="note-bar"
        class:golden={isGolden}
        class:rap={isRap}
        class:freestyle={isFreestyle}
      >
      <!-- Syllable label (optional, only when bar is wide enough) -->
      {#if showNoteSyllables && cell.colSpan >= 2}
        <span class="note-syllable">{cell.note.syllable.trim()}</span>
      {/if}
      </div>
    </div>
  {/each}

  <!-- Sung segments: one div per grouped segment, rendered in front of note bars -->
  {#each sungSegments as seg (seg.startCol + '_' + seg.row)}
    <div
      class="sung-segment"
      class:correct={seg.correct}
      style="
        grid-column: {seg.startCol} / span {seg.length};
        grid-row: {seg.row};
      "
    ></div>
  {/each}

  <!-- Piano-roll row lines (optional, for visual reference) -->
  {#if showPianoRollLines}
    {#each Array(rowCount) as _, i}
      <div class="row-line" style="grid-row: {i + 1}; grid-column: 1 / -1;"></div>
    {/each}
  {/if}

  <!-- Perfect line flash overlay -->
  {#if perfectFlash}
    <div class="perfect-overlay" style="grid-row: 1 / -1; grid-column: 1 / -1;">
      <span class="perfect-text">PERFECT!</span>
    </div>
  {/if}
</div>

<style>
  .note-lane {
    width: 100%;
    height: 100%;            /* fills whatever the parent lane-wrap gives it */
    display: grid;
    grid-template-rows:    repeat(var(--rows), 1fr);
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 2px;
    padding: var(--space-2) var(--space-4);
    box-sizing: border-box;
  }

  /* ── Piano-roll row lines (DEBUG) ── */
  .row-line {
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    pointer-events: none;
    z-index: 0;
  }

  /* ── Sung segments (one per consecutive same-pitch run) ── */
  .sung-segment {
    pointer-events: none;
    z-index: 4;
    align-self: center;
    height: max(70%, var(--bar-min-h, 24px));
    border-radius: var(--bar-radius, 4px);
    background: var(--player-color);
    opacity: 0.45;
  }

  .sung-segment.correct {
    opacity: 0.85;
  }

  /* ── Note cell (grid item, full cell height) ── */
  .note-cell {
    position: relative;
  }

  /* ── Note bar (centered inside cell) ── */
  .note-bar {
    position: absolute;
    left: 0;
    right: 0;
    height: max(80%, var(--bar-min-h, 28px));
    top: 50%;
    transform: translateY(calc(-50% - 1.75px));  /* compensate for 1.5px border */
    background: var(--bar-bg);
    border: 2px solid var(--bar-border);
    border-radius: var(--bar-radius, 4px);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-width: 0;
  }

  .note-bar.golden {
    background: rgba(255, 210, 60, 0.2);
    border-color: rgba(255, 210, 60, 0.85);
    box-shadow: 0 0 8px rgba(255, 210, 60, 0.45);
    animation: golden-shimmer 1.4s ease-in-out infinite;
  }

  @keyframes golden-shimmer {
    0%   { box-shadow: 0 0 6px rgba(255, 210, 60, 0.35), inset 0 0 8px rgba(255, 210, 60, 0.0); }
    50%  { box-shadow: 0 0 14px rgba(255, 215, 80, 0.75), inset 0 0 10px rgba(255, 215, 80, 0.18); }
    100% { box-shadow: 0 0 6px rgba(255, 210, 60, 0.35), inset 0 0 8px rgba(255, 210, 60, 0.0); }
  }

  .note-bar.rap {
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.08);
  }

  .note-bar.freestyle {
    border-style: dotted;
    border-color: rgba(255, 255, 255, 0.2);
    background: transparent;
  }


  /* ── Syllable text ── */
  .note-syllable {
    position: relative;
    z-index: 1;
    font-size: clamp(0.55rem, 1.2vw, 0.95rem);
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    text-shadow: 0 1px 3px rgba(0,0,0,0.6);
    max-width: 100%;
    padding: 0 2px;
    line-height: 1;
    margin-bottom: 2px;
  }

  .note-bar.golden .note-syllable {
    color: #ffe680;
  }

  /* ── Perfect flash ── */
  .perfect-overlay {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 20;
  }

  .perfect-text {
    font-size: clamp(1.4rem, 3.5vw, 2.4rem);
    font-weight: 900;
    letter-spacing: 0.12em;
    color: #fff;
    text-shadow:
      0 0 18px var(--player-color),
      0 0 40px var(--player-color),
      0 2px 8px rgba(0,0,0,0.9);
    animation: perfect-pop 1.6s ease forwards;
  }

  @keyframes perfect-pop {
    0%   { opacity: 0; transform: scale(0.4); }
    12%  { opacity: 1; transform: scale(1.15); }
    22%  { opacity: 1; transform: scale(0.97); }
    65%  { opacity: 1; transform: scale(1.0); }
    100% { opacity: 0; transform: scale(0.95) translateY(-16px); }
  }
</style>
