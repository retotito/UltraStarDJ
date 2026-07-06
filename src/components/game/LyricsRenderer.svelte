<script lang="ts">
  import type { NoteTrack, LyricLine, Note } from '$lib/ultrastar/types'

  let { tracks, currentTime, bpm, gap, trackIndex = 0, playerColor = null }: {
    tracks: NoteTrack[]
    currentTime: number
    bpm: number
    gap: number       // ms offset before first note
    trackIndex?: number
    playerColor?: string | null
  } = $props()

  // UltraStar beat formula — negative beats are valid (pre-GAP notes)
  const currentBeat = $derived(
    (currentTime - gap / 1000) * (bpm / 60) * 4
  )

  /** Find the line currently being sung in a track */
  function getActiveLine(lines: LyricLine[]): LyricLine | null {
    let active: LyricLine | null = null
    for (const line of lines) {
      const firstNote = line.notes[0]
      const lastNote = line.notes[line.notes.length - 1]
      if (!firstNote || !lastNote) continue
      const lineStart = firstNote.startBeat
      const lineEnd = lastNote.startBeat + lastNote.lengthBeats
      if (lineStart <= currentBeat && currentBeat <= lineEnd + 8) {
        active = line
      }
    }
    return active
  }

  /** Find the next line after the active one */
  function getNextLine(lines: LyricLine[], active: LyricLine | null): LyricLine | null {
    if (!active) {
      return lines.find(l => (l.notes[0]?.startBeat ?? l.startBeat) > currentBeat) ?? null
    }
    const idx = lines.indexOf(active)
    return idx >= 0 && idx + 1 < lines.length ? lines[idx + 1] : null
  }

  /** Is a note currently being sung? */
  function isNoteActive(note: Note): boolean {
    return currentBeat >= note.startBeat && currentBeat < note.startBeat + note.lengthBeats
  }

  /** Is a note already past? */
  function isNotePast(note: Note): boolean {
    return currentBeat >= note.startBeat + note.lengthBeats
  }

  // Use the specified trackIndex — P1=0, P2=1, etc.
  const track = $derived(tracks[trackIndex] ?? null)
  const activeLine = $derived(track ? getActiveLine(track.lines) : null)
  const nextLine = $derived(track ? getNextLine(track.lines, activeLine) : null)
</script>

<div class="lyrics-renderer">
  <div class="line-current">
    {#if activeLine}
      {#each activeLine.notes as note (note.startBeat)}
        <span
          class="syllable"
          class:active={isNoteActive(note)}
          class:past={isNotePast(note)}
          class:golden={note.type === 'golden'}
          style={playerColor && isNotePast(note) && note.type !== 'golden' ? `color: ${playerColor}` : ''}
        >{note.syllable}</span>
      {/each}
    {:else}
      <span class="line-placeholder">♪</span>
    {/if}
  </div>

  <div class="line-next">
    {#if nextLine}
      {#each nextLine.notes as note (note.startBeat)}
        <span class="syllable">{note.syllable}</span>
      {/each}
    {/if}
  </div>
</div>

<style>
  .lyrics-renderer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.2rem;
    padding: 2rem;
    width: 100%;
  }

  .line-current {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0;
    font-size: clamp(2rem, 5vw, 4.5rem);
    font-weight: 800;
    letter-spacing: 0.01em;
    line-height: 1.2;
    min-height: 1.4em;
  }

  .line-next {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0;
    font-size: clamp(1rem, 2.5vw, 2.2rem);
    font-weight: 500;
    opacity: 0.4;
    letter-spacing: 0.01em;
    min-height: 1.4em;
  }

  .syllable {
    color: var(--md-sys-color-on-surface);
    transition: color 0.05s, text-shadow 0.05s;
    white-space: pre;
  }

  .line-current .syllable.past {
    color: var(--md-sys-color-primary);
  }

  .line-current .syllable.active {
    color: #fff;
    text-shadow: 0 0 20px var(--md-sys-color-primary), 0 0 40px var(--md-sys-color-primary);
  }

  .line-current .syllable.golden.past,
  .line-current .syllable.golden.active {
    color: #ffd700;
    text-shadow: 0 0 20px #ffd700, 0 0 40px #ffd700aa;
  }

  .line-placeholder {
    opacity: 0.2;
  }
</style>
