<script lang="ts">
  import type { NoteTrack, LyricLine, Note } from '$lib/ultrastar/types'

  let { tracks, trackIndex = 0, playerColor = '#ffffff', currentTime, bpm, gap, rowCount = 16 }: {
    tracks: NoteTrack[]
    trackIndex?: number
    playerColor?: string
    currentTime: number
    bpm: number
    gap: number     // ms
    rowCount?: number
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

  // ── Progress through the current note (for fill animation) ─────────────────
  function noteFillPct(note: Note): number {
    if (currentBeat < note.startBeat) return 0
    if (currentBeat >= note.startBeat + note.lengthBeats) return 100
    return ((currentBeat - note.startBeat) / note.lengthBeats) * 100
  }
</script>

<div
  class="note-lane"
  style="
    --rows: {rowCount};
    --cols: {phraseBeats};
    --player-color: {playerColor};
  "
>
  {#each cells as cell (cell.note.startBeat + '_' + cell.note.pitch)}
    {@const pct = noteFillPct(cell.note)}
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
      <!-- Fill overlay showing how far the beat has progressed through this note -->
      {#if pct > 0}
        <div
          class="note-fill"
          style="width: {pct}%"
        ></div>
      {/if}
      <!-- Syllable label (only show if bar is wide enough) -->
      {#if cell.colSpan >= 2}
        <span class="note-syllable">{cell.note.syllable.trim()}</span>
      {/if}
      </div>
    </div>
  {/each}

  <!-- Piano-roll row lines (DEBUG) -->
  {#each Array(rowCount) as _, i}
    <div class="row-line" style="grid-row: {i + 1}; grid-column: 1 / -1;"></div>
  {/each}
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

  /* ── Note cell (grid item, full cell height) ── */
  .note-cell {
    position: relative;
  }

  /* ── Note bar (centered inside cell) ── */
  .note-bar {
    position: absolute;
    left: 0;
    right: 0;
    height: max(80%, 28px);
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.18);
    border: 1.5px solid rgba(255, 255, 255, 0.35);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-width: 0;
  }

  .note-bar.golden {
    background: rgba(255, 210, 60, 0.2);
    border-color: rgba(255, 210, 60, 0.7);
    box-shadow: 0 0 6px rgba(255, 210, 60, 0.3);
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

  /* ── Fill overlay (current beat progress) ── */
  .note-fill {
    position: absolute;
    inset: 0;
    right: auto;
    background: var(--player-color);
    opacity: 0.55;
    pointer-events: none;
    transition: width 80ms linear;
  }

  .note-bar.golden .note-fill {
    background: #ffd23c;
    opacity: 0.7;
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
  }

  .note-bar.golden .note-syllable {
    color: #ffe680;
  }
</style>
