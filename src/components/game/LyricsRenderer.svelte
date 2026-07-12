<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { NoteTrack, LyricLine, Note } from '$lib/ultrastar/types'

  let { tracks, currentTime, bpm, gap, trackIndex = 0, playerColor = null, playing = true }: {
    tracks: NoteTrack[]
    currentTime: number
    bpm: number
    gap: number       // ms offset before first note
    trackIndex?: number
    playerColor?: string | null
    playing?: boolean
  } = $props()

  const color = $derived(playerColor ?? '#ffffff')

  // ── Smooth currentTime via rAF interpolation ────────────────────────────────
  // audio timeupdate fires ~4Hz; we interpolate at 60fps to avoid gradient judder
  let smoothTime = $state(currentTime)
  let lastKnownTime = currentTime
  let lastKnownAt   = performance.now()
  let rafId: number

  $effect(() => {
    // When the prop changes, re-anchor the interpolation
    lastKnownTime = currentTime
    lastKnownAt   = performance.now()
  })

  function tick() {
    if (playing) {
      const elapsed = (performance.now() - lastKnownAt) / 1000
      smoothTime = lastKnownTime + elapsed
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
  onDestroy(() => cancelAnimationFrame(rafId))

  // UltraStar beat formula
  const currentBeat = $derived(
    (smoothTime - gap / 1000) * (bpm / 60) * 4
  )

  // How many beats = 3 seconds (lead-in window)
  const leadInBeats = $derived((bpm / 60) * 4 * 3)

  /** Find the line that should be shown (includes small lookahead so it appears before it starts) */
  function getActiveLine(lines: LyricLine[]): LyricLine | null {
    for (const line of lines) {
      const firstNote = line.notes[0]
      const lastNote  = line.notes[line.notes.length - 1]
      if (!firstNote || !lastNote) continue
      const lineStart = firstNote.startBeat
      const lineEnd   = lastNote.startBeat + lastNote.lengthBeats
      // Show from 3 seconds before the phrase starts until it fully ends (+8 beats grace)
      if (currentBeat >= lineStart - leadInBeats && currentBeat <= lineEnd + 8) {
        return line
      }
    }
    // Outside any lead-in window — show the next upcoming phrase immediately
    // (covers song start and long gaps between phrases)
    return lines.find(l => {
      const last = l.notes[l.notes.length - 1]
      return last && (last.startBeat + last.lengthBeats + 8) > currentBeat
    }) ?? null
  }

  /** Find the next line after the active one */
  function getNextLine(lines: LyricLine[], active: LyricLine | null): LyricLine | null {
    if (!active) {
      return lines.find(l => (l.notes[0]?.startBeat ?? l.startBeat) > currentBeat) ?? null
    }
    const idx = lines.indexOf(active)
    return idx >= 0 && idx + 1 < lines.length ? lines[idx + 1] : null
  }

  /** Gradient sweep percentage for a syllable (0–100) */
  function sweepPct(note: Note): number {
    if (currentBeat < note.startBeat) return 0
    if (currentBeat >= note.startBeat + note.lengthBeats) return 100
    return ((currentBeat - note.startBeat) / note.lengthBeats) * 100
  }

  // Sung fill colours per note type
  // normal/freestyle use player colour; golden = amber; rap = orange; freestyle = grey when done
  function sweepColor(note: Note): string {
    if (note.type === 'golden')    return '#ffd700'
    if (note.type === 'rap' || note.type === 'rap-golden') return '#ff8c42'
    if (note.type === 'freestyle') return 'rgba(255,255,255,0.5)'
    return '#4f8ef7'  // normal — fixed blue
  }

  /** Inline gradient style for a note syllable */
  function syllableStyle(note: Note): string {
    const pct = sweepPct(note)
    const c   = sweepColor(note)

    if (pct <= 0) {
      // Before playhead: golden gets a soft tint, rest are plain white
      if (note.type === 'golden')    return 'color: rgba(255,215,0,0.35)'
      if (note.type === 'freestyle') return 'color: rgba(255,255,255,0.55)'
      return 'color: rgba(255,255,255,0.85)'
    }

    if (pct >= 100) {
      return `color: ${c}; text-shadow: 0 0 16px ${c}99`
    }

    return `background-image: linear-gradient(to right, ${c} ${pct}%, rgba(255,255,255,0.85) ${pct}%); background-clip: text; -webkit-background-clip: text; color: transparent`
  }

  /** Lead-in playhead — always computed, opacity handles visibility */
  const leadIn = $derived.by(() => {
    if (!activeLine) return { style: '', visible: false }
    const firstBeat = activeLine.notes[0]?.startBeat
    if (firstBeat === undefined) return { style: '', visible: false }
    const pct   = ((currentBeat - firstBeat) * -100) / leadInBeats
    const end   = pct
    const start = pct + 30
    const visible = pct > -5 && pct < 110
    return {
      style: `background-image: linear-gradient(270deg, transparent ${end}%, #4f8ef7 ${end}%, transparent ${start}%)`,
      visible,
    }
  })

  const track      = $derived(tracks[trackIndex] ?? null)
  const activeLine = $derived(track ? getActiveLine(track.lines) : null)
  const nextLine   = $derived(track ? getNextLine(track.lines, activeLine) : null)
  const visible    = $derived(activeLine !== null)

  /** Whether to insert a space after note at index i.
   * New style: trailing space on current → space after it
   * Old style: leading space on next → space after current
   * Legacy (no spaces): space after every syllable */
  function needsTrailingSpace(notes: Note[], i: number): boolean {
    if (!notes[i + 1]) return false
    const curr = notes[i].syllable
    const next = notes[i + 1].syllable
    const encoded = notes.some(n => n.syllable.endsWith(' ') || n.syllable.startsWith(' '))
    if (encoded) return curr.endsWith(' ') || next.startsWith(' ')
    return true
  }
</script>

<div class="lyrics-renderer" class:visible>

  <!-- 3-col grid: [lead-in 1fr] [lyrics max-content] [1fr] -->
  <div class="current-row">
    <div class="lead-in-col">
      <div
        class="lead-in-bar"
        style="--lead-color: {color}; {leadIn.style}; opacity: {leadIn.visible ? 1 : 0}"
      ></div>
    </div>

    <div class="text-col">
      {#if activeLine}
        {#each activeLine.notes as note, i (note.startBeat)}
          <span
            class="syllable"
            class:golden={note.type === 'golden'}
            class:freestyle={note.type === 'freestyle'}
            class:rap={note.type === 'rap' || note.type === 'rap-golden'}
            style={syllableStyle(note)}
          >{note.syllable}{needsTrailingSpace(activeLine.notes, i) ? ' ' : ''}</span>
        {/each}
      {/if}
    </div>

    <div></div>
  </div>

  <!-- Upcoming phrase -->
  <div class="line-next">
    {#if nextLine}
      {#each nextLine.notes as note, i (note.startBeat)}
        <span
          class="syllable"
          class:freestyle={note.type === 'freestyle'}
          class:rap={note.type === 'rap' || note.type === 'rap-golden'}
        >{note.syllable}{needsTrailingSpace(nextLine.notes, i) ? ' ' : ''}</span>
      {/each}
    {/if}
  </div>
</div>

<style>
  .lyrics-renderer {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.5rem 0 1.35rem;
    width: 100%;
    opacity: 0;
    transition: opacity 0.4s ease;
  }

  .lyrics-renderer.visible {
    opacity: 1;
  }

  /* 3-column grid row for current phrase + lead-in */
  .current-row {
    display: grid;
    grid-template-columns: 1fr max-content 1fr;
    align-items: center;
    font-size: clamp(1.4rem, 3.2vw, 2.8rem);
    font-weight: 800;
    letter-spacing: 0.01em;
    line-height: 1.25;
    min-height: 1.3em;
  }

  .lead-in-col {
    height: 0.9em;      /* 90% of font size, centred vertically */
    overflow: hidden;
    transition: opacity 0.15s ease;
    align-self: center;
  }

  .lead-in-bar {
    width: 100%;
    height: 100%;
    --lead-color: #4f8ef7;
  }

  .text-col {
    text-align: center;
  }

  /* ── Upcoming phrase ── */
  .line-next {
    display: block;
    text-align: center;
    font-size: clamp(0.85rem, 1.8vw, 1.5rem);
    font-weight: 500;
    color: rgba(255, 255, 255, 0.45);
    letter-spacing: 0.01em;
    min-height: 1.3em;
  }

  /* ── Syllable base ── */
  .syllable {
    display: inline-block;  /* needed for background-clip: text gradient sweep */
    white-space: pre;       /* preserves word-boundary spaces from UltraStar format */
  }

  .syllable.freestyle {
    font-style: italic;
    opacity: 0.7;
  }

  .syllable.rap {
    font-style: normal;
  }
</style>
