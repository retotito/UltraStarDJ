<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { NoteTrack, LyricLine, Note } from '$lib/ultrastar/types'

  let { tracks, currentTime, bpm, gap, trackIndex = 0, playerColor = null }: {
    tracks: NoteTrack[]
    currentTime: number
    bpm: number
    gap: number       // ms offset before first note
    trackIndex?: number
    playerColor?: string | null
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
    const elapsed = (performance.now() - lastKnownAt) / 1000
    smoothTime = lastKnownTime + elapsed
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

  /** Inline gradient style for a note syllable */
  function syllableStyle(note: Note): string {
    const pct = sweepPct(note)
    const c = note.type === 'golden' ? '#ffd700' : color
    if (pct <= 0)  return 'color: rgba(255,255,255,0.85)'
    if (pct >= 100) return note.type === 'golden'
      ? `color: #ffd700; text-shadow: 0 0 16px #ffd700aa`
      : `color: ${c}; text-shadow: 0 0 14px ${c}66`
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

  /** Whether to insert a space after note at index i (auto word-boundary detection) */
  function needsTrailingSpace(notes: Note[], i: number): boolean {
    const curr = notes[i]
    const next = notes[i + 1]
    if (!next) return false
    return !curr.syllable.endsWith(' ') && !next.syllable.startsWith(' ')
  }
</script>

<div class="lyrics-renderer" class:visible>

  <!-- 3-col grid: [lead-in 1fr] [lyrics max-content] [1fr] -->
  <div class="current-row">
    <div class="lead-in-col">
      <div
        class="lead-in-bar"
        style="{leadIn.style}; opacity: {leadIn.visible ? 1 : 0}"
      ></div>
    </div>

    <div class="text-col">
      {#if activeLine}
        {#each activeLine.notes as note, i (note.startBeat)}
          <span
            class="syllable"
            class:golden={note.type === 'golden'}
            class:freestyle={note.type === 'freestyle'}
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
        <span class="syllable" class:freestyle={note.type === 'freestyle'}>{note.syllable}{needsTrailingSpace(nextLine.notes, i) ? ' ' : ''}</span>
      {/each}
    {/if}
  </div>
</div>

<style>
  .lyrics-renderer {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.5rem 0 0.7rem;
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
</style>
