<script lang="ts">
  import type { NoteTrack, LyricLine, Note } from '$lib/ultrastar/types'
  import type { PitchTickEntry } from '$lib/ipc/tauri'
  import { untrack } from 'svelte'

  let {
    tracks, trackIndex = 0, playerColor = '#ffffff', currentTime, bpm, gap,
    rowCount = 16, showPianoRollLines = true, showNoteSyllables = true,
    noteBarStyle = 'white', noteBarMinHeight = 28, noteBarRadius = 4,
    pitchTick = null, playing = true, micDelayMs = 0
  }: {
    tracks: NoteTrack[]
    trackIndex?: number
    playerColor?: string
    currentTime: number
    bpm: number
    gap: number
    rowCount?: number
    showPianoRollLines?: boolean
    showNoteSyllables?: boolean
    noteBarStyle?: 'white' | 'black'
    noteBarMinHeight?: number
    noteBarRadius?: number
    pitchTick?: PitchTickEntry | null
    playing?: boolean
    micDelayMs?: number
  } = $props()

  // ── Beat math — derived from currentTime prop (10fps) ────────────────────
  const currentBeat = $derived(
    (currentTime - gap / 1000) * (bpm / 60) * 4
  )

  const track = $derived(tracks[trackIndex] ?? null)

  // ── Active phrase ──────────────────────────────────────────────────────────
  const activeLine = $derived.by(() => {
    if (!track) return null
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
    let p = pitch
    const min = Math.floor(avg - rows / 2)
    const max = min + rows - 1
    while (p > max) p -= 12
    while (p < min) p += 12
    const offset = p - avg
    const row = Math.ceil(rows / 2 - offset)
    return Math.max(1, Math.min(rows, row))
  }

  // ── Note cells: absolute % positions, computed once per phrase ─────────────
  type NoteCell = {
    note:     Note
    leftPct:  number
    widthPct: number
    row:      number
  }

  const phraseBeats = $derived.by(() => {
    if (!activeLine || !activeLine.notes.length) return 16
    const first = activeLine.notes[0].startBeat
    const last  = activeLine.notes[activeLine.notes.length - 1]
    return last.startBeat + last.lengthBeats - first
  })

  const phraseFirstBeat = $derived(activeLine?.notes[0]?.startBeat ?? 0)

  const cells = $derived.by((): NoteCell[] => {
    if (!activeLine) return []
    const firstBeat = activeLine.notes[0].startBeat
    const avg       = avgPitch(activeLine)
    return activeLine.notes.map(note => ({
      note,
      leftPct:  (note.startBeat - firstBeat) / phraseBeats * 100,
      widthPct: Math.max(1, note.lengthBeats) / phraseBeats * 100,
      row:      pitchToRow(note.pitch, avg, rowCount),
    }))
  })

  // ── Per-note state (glow/perfect tracking) + per-phrase sung segments ─────
  type NoteState = {
    correct:      boolean
    rapHit:       boolean
    correctBeats: number
  }

  // A contiguous run of beats at the same row (correct or wrong)
  type BeatSegment = {
    startBeat: number   // absolute beat where this segment starts
    beatCount: number   // grows each tick
    row:       number   // 1-based row
    isCorrect: boolean
    isGolden:  boolean
  }

  const noteStates = $state<Record<number, NoteState>>({})
  const phraseSegments = $state<BeatSegment[]>([])
  let _lastLine:            LyricLine | null = null
  let _lastBeat:            number           = -1
  let _evaluatedForPerfect: boolean          = false
  let perfectFlash = $state(false)

  $effect(() => {
    const line = activeLine
    const tick = pitchTick

    if (line !== _lastLine) {
      for (const k in noteStates) delete (noteStates as any)[k]
      phraseSegments.length = 0
      if (line) {
        for (const note of line.notes) {
          noteStates[note.startBeat] = { correct: false, rapHit: false, correctBeats: 0 }
        }
      }
      _lastBeat = -1
      _evaluatedForPerfect = false
      _lastLine = line
    }

    if (!tick || !line || tick.beat < 0) return

    const intBeat = Math.floor(tick.beat)
    if (intBeat === _lastBeat) return
    _lastBeat = intBeat

    const note = line.notes.find(
      n => intBeat >= n.startBeat && intBeat < n.startBeat + n.lengthBeats
    )
    if (!note) return

    const state = noteStates[note.startBeat]
    if (!state) return

    // ── Beat segment tracking (tunePerfect-style) ──────────────────────────
    // Group consecutive beats into contiguous segments. Each beat of silence or
    // pitch/row change starts a new segment. Correct beats → note's own row.
    // Wrong beats → singer's actual pitch row (above/below the note).
    if (tick.midiNote >= 0) {
      const noteRow  = cells.find(c => c.note === note)?.row ?? 1
      const avg      = avgPitch(line)
      const sungRow  = pitchToRow(tick.rowPitch, avg, rowCount)
      const dispRow  = tick.correct ? noteRow : sungRow
      const isGolden = note.type === 'golden'

      const last = phraseSegments[phraseSegments.length - 1]
      if (
        last &&
        last.row === dispRow &&
        last.isCorrect === tick.correct &&
        last.startBeat + last.beatCount === intBeat
      ) {
        last.beatCount++
      } else {
        phraseSegments.push({ startBeat: intBeat, beatCount: 1, row: dispRow, isCorrect: tick.correct, isGolden })
      }
    }

    if (tick.correct) {
      state.correct      = true
      state.correctBeats++
    }

    if (tick.correct && (note.type === 'rap' || note.type === 'rap-golden')) {
      state.rapHit = true
    }

    if (!_evaluatedForPerfect) {
      const lastNote       = line.notes[line.notes.length - 1]
      const phraseLastBeat = lastNote.startBeat + lastNote.lengthBeats - 1
      if (intBeat >= phraseLastBeat) {
        _evaluatedForPerfect = true
        const allPerfect = line.notes
          .filter(n => n.type !== 'freestyle')
          .every(n => (noteStates[n.startBeat]?.correctBeats ?? 0) * 2 >= n.lengthBeats)
        if (allPerfect) {
          perfectFlash = true
          setTimeout(() => { perfectFlash = false }, 1600)
        }
      }
    }
  })

  // ── CSS playhead: GPU animation, triggered by audio clock ────────────────
  let playheadEl = $state<HTMLElement | undefined>(undefined)

  // phraseStartSec as $derived so it updates when activeLine changes
  const _phraseStartSec = $derived.by(() => {
    if (!activeLine || !activeLine.notes.length) return Infinity
    return activeLine.notes[0].startBeat * (60 / bpm / 4) + gap / 1000
  })
  const _phraseDurSec = $derived.by(() => {
    if (!activeLine || !activeLine.notes.length) return 0
    const last = activeLine.notes[activeLine.notes.length - 1]
    return (last.startBeat + last.lengthBeats) * (60 / bpm / 4) + gap / 1000 - _phraseStartSec
  })

  // True once currentTime reaches phrase start — this is the audio-clock trigger
  const phraseActive = $derived(currentTime >= _phraseStartSec && _phraseDurSec > 0)

  $effect(() => {
    if (!phraseActive || !playheadEl) return

    const elapsed    = untrack(() => currentTime) - untrack(() => _phraseStartSec)
    const phraseDur  = untrack(() => _phraseDurSec)
    // Negative delay = seek to compensate for IPC tick latency (≤16ms at 16ms tick rate)
    const animDelay  = -Math.max(0, elapsed)

    playheadEl.style.animationName          = 'none'
    playheadEl.style.animationDuration      = `${phraseDur}s`
    playheadEl.style.animationDelay         = `${animDelay}s`
    playheadEl.style.animationTimingFunction = 'linear'
    playheadEl.style.animationFillMode      = 'none'
    void playheadEl.offsetWidth
    playheadEl.style.animationName          = 'playhead-slide'
  })

  // Pause/resume the CSS animation when playing prop changes
  $effect(() => {
    if (!playheadEl) return
    playheadEl.style.animationPlayState = playing ? 'running' : 'paused'
  })

</script>

<div
  class="note-lane"
  style="
    --player-color: {playerColor};
    --bar-min-h:    {noteBarMinHeight}px;
    --bar-radius:   {noteBarRadius}px;
    --bar-bg:       {noteBarStyle === 'black' ? 'rgba(0,0,0,0.45)'      : 'rgba(255,255,255,0.18)'};
    --bar-border:   {noteBarStyle === 'black' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.35)'};
  "
>
  <div class="lane-content">

    {#if showPianoRollLines}
      {#each Array(rowCount) as _, i}
        <div class="row-line" style="top: {i / rowCount * 100}%; height: {1 / rowCount * 100}%"></div>
      {/each}
    {/if}

    {#each cells as cell (cell.note.startBeat)}
      {@const state         = noteStates[cell.note.startBeat]}
      {@const isGolden      = cell.note.type === 'golden'}
      {@const isRap         = cell.note.type === 'rap' || cell.note.type === 'rap-golden'}
      {@const isFreestyle   = cell.note.type === 'freestyle'}
      {@const isFullyCorrect = (state?.correctBeats ?? 0) * 2 >= cell.note.lengthBeats && cell.note.lengthBeats > 0}

      <div
        class="note-cell"
        style="
          left:   {cell.leftPct}%;
          width:  {cell.widthPct}%;
          top:    {(cell.row - 1) / rowCount * 100}%;
          height: {1 / rowCount * 100}%;
        "
      >
        <div
          class="note-bar"
          class:golden={isGolden}
          class:rap={isRap}
          class:rap-hit={isRap && state?.rapHit}
          class:freestyle={isFreestyle}
          class:sung-correct={isFullyCorrect && !isGolden}
          class:golden-correct={isGolden && isFullyCorrect}
        >
          {#if showNoteSyllables && cell.note.syllable?.trim()}
            <span class="note-syllable">{cell.note.syllable.trim()}</span>
          {/if}
        </div>

        {#if isRap}
          <span class="rap-badge" class:rap-hit={state?.rapHit}>
            {cell.note.type === 'rap-golden' ? '★' : 'R'}
          </span>
        {/if}
        {#if isFreestyle}
          <span class="freestyle-badge">F</span>
        {/if}
      </div>
    {/each}

    <!-- Sung beat segments: correct ones sit on note row, wrong ones float above/below -->
    {#each phraseSegments as seg (seg.startBeat)}
      <div
        class="sung-segment"
        class:correct={seg.isCorrect}
        class:golden={seg.isGolden && seg.isCorrect}
        style="
          left:   {(seg.startBeat - phraseFirstBeat) / phraseBeats * 100}%;
          width:  {seg.beatCount / phraseBeats * 100}%;
          top:    {(seg.row - 1) / rowCount * 100}%;
          height: {1 / rowCount * 100}%;
        "
      ></div>
    {/each}

    {#if perfectFlash}
      <div class="perfect-overlay">
        <span class="perfect-text">PERFECT!</span>
      </div>
    {/if}

    <!-- PLAYHEAD DISABLED — kept for future use
    <!-- PLAYHEAD DISABLED — kept for future use
    <div bind:this={playheadEl} class="playhead-line" aria-hidden="true"></div>
    -->
    -->

  </div>
</div>

<style>
  .note-lane {
    width: 100%;
    height: 100%;
    position: relative;
    box-sizing: border-box;
  }

  .lane-content {
    position: absolute;
    top:    var(--space-2);
    left:   var(--space-4);
    right:  var(--space-4);
    bottom: var(--space-2);
  }

  .row-line {
    position: absolute;
    left: 0; right: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    pointer-events: none;
    z-index: 0;
  }

  .note-cell {
    position: absolute;
    box-sizing: border-box;
  }

  .note-bar {
    position: absolute;
    left: 1px; right: 1px;
    height: max(80%, var(--bar-min-h, 28px));
    top: 50%;
    transform: translateY(calc(-50% - 1px));
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
    will-change: opacity;
  }

  @keyframes golden-shimmer {
    0%   { opacity: 0.75; }
    50%  { opacity: 1.0; }
    100% { opacity: 0.75; }
  }

  .note-bar.rap {
    border-style: dashed;
    border-color: rgba(255, 165, 50, 0.5);
    background: rgba(255, 165, 50, 0.08);
  }

  .note-bar.rap.rap-hit {
    background: rgba(255, 140, 0, 0.35);
    border-color: rgba(255, 165, 50, 0.8);
    border-style: solid;
    animation: rap-hit-pop 0.25s ease-out 1 forwards;
  }

  @keyframes rap-hit-pop {
    0%   { background: rgba(255, 140, 0, 0.75); box-shadow: 0 0 10px rgba(255, 140, 0, 0.6); }
    60%  { background: rgba(255, 140, 0, 0.45); box-shadow: 0 0 6px rgba(255, 140, 0, 0.3); }
    100% { background: rgba(255, 140, 0, 0.35); box-shadow: none; }
  }

  .note-bar.freestyle {
    border-style: dotted;
    border-color: rgba(255, 255, 255, 0.2);
    background: transparent;
  }

  .note-bar.sung-correct {
    animation: note-correct-pulse 0.5s ease-out 1 forwards;
  }

  .note-bar.golden-correct {
    animation: note-correct-pulse-golden 0.5s ease-out 1 forwards;
  }

  @keyframes note-correct-pulse {
    0%   { border-color: var(--bar-border); box-shadow: none; }
    40%  { border-color: rgba(255,255,255,0.95); box-shadow: 0 0 10px rgba(255,255,255,0.5); }
    100% { border-color: rgba(255,255,255,0.7);  box-shadow: 0 0 6px rgba(255,255,255,0.25); }
  }

  @keyframes note-correct-pulse-golden {
    0%   { border-color: rgba(255,210,60,0.85); box-shadow: none; }
    40%  { border-color: rgba(255,220,80,1);    box-shadow: 0 0 14px rgba(255,215,0,0.75); }
    100% { border-color: rgba(255,215,0,0.9);   box-shadow: 0 0 8px rgba(255,215,0,0.4); }
  }

  /* Sung beat segments — stack on top of note bars as a separate layer */
  .sung-segment {
    position: absolute;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 5;
    transition: width 80ms linear;
  }

  /* Inner bar: vertically centered in the row, matching note-bar geometry */
  .sung-segment::after {
    content: '';
    position: absolute;
    left: 1px; right: 1px;
    height: max(80%, var(--bar-min-h, 28px));
    top: 50%;
    transform: translateY(-50%);
    border-radius: var(--bar-radius, 4px);
    background: var(--player-color);
    opacity: 0.5;
  }

  .sung-segment.correct::after {
    opacity: 0.85;
  }

  .sung-segment.golden::after {
    background: #ffd700;
    box-shadow: 0 0 6px rgba(255, 215, 0, 0.5);
  }

  .note-fill {
    display: none; /* legacy — replaced by .sung-segment */
  }

  .perfect-overlay {
    position: relative;
    z-index: 2;
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
  }

  .note-bar.golden .note-syllable { color: #ffe680; }

  .rap-badge,
  .freestyle-badge {
    position: absolute;
    bottom: 100%;
    right: 3px;
    margin-bottom: 2px;
    font-size: 0.75rem;
    font-weight: 900;
    line-height: 1;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 2px;
    padding: 1px 2px;
    pointer-events: none;
    z-index: 6;
  }

  .rap-badge         { color: #ff8c00; }
  .rap-badge.rap-hit { color: #fff; }
  .freestyle-badge   { color: rgba(255,255,255,0.55); font-style: italic; }

  .perfect-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 20;
    animation: perfect-fade 1.6s ease-out 1 forwards;
  }

  @keyframes perfect-fade {
    0%   { opacity: 0; }
    15%  { opacity: 1; }
    70%  { opacity: 1; }
    100% { opacity: 0; }
  }

  .perfect-text {
    font-size: clamp(1.2rem, 3vw, 2.2rem);
    font-weight: 900;
    letter-spacing: 0.12em;
    color: #fff;
    text-shadow: 0 0 20px rgba(255,255,255,0.8), 0 0 40px rgba(255,255,255,0.4);
    text-transform: uppercase;
  }

  .playhead-line {
    position: absolute;
    top: 0; bottom: 0; left: 0;
    width: 100%;
    border-left: 2px solid rgba(255, 255, 255, 0.6);
    opacity: 0; /* hidden — kept for future use */
    opacity: 1;
    will-change: transform;
    pointer-events: none;
    z-index: 15;
  }
</style>
