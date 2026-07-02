/**
 * Core data types for UltrastarDJ.
 * Every song from any source is normalized to this interface.
 */

export interface Song {
  /** Unique ID — generated from source + file path */
  id: string
  /** Source identifier */
  sourceId: string

  /* --- Metadata (from .txt header) --- */
  title: string
  artist: string
  bpm: number
  gap: number          // ms offset before first note
  year?: number
  language?: string
  genre?: string
  edition?: string
  creator?: string
  comment?: string

  /* --- File paths (absolute, local) --- */
  txtPath: string
  audioPath?: string
  videoPath?: string
  coverPath?: string
  backgroundPath?: string

  /* --- Video timing --- */
  videoGap?: number    // ms offset for video vs audio

  /* --- Parsed notes (loaded on demand, not at library scan) --- */
  notes?: NoteTrack[]
}

export interface NoteTrack {
  /** Player index: 0 = P1, 1 = P2 */
  player: number
  lines: LyricLine[]
}

export interface LyricLine {
  /** Beat position where this line starts */
  startBeat: number
  notes: Note[]
}

export type NoteType = 'normal' | 'golden' | 'freestyle' | 'rap' | 'rap-golden'

export interface Note {
  type: NoteType
  startBeat: number
  lengthBeats: number
  pitch: number       // MIDI semitone
  syllable: string
}

/** What the DJ sends to the beamer window when starting a song */
export interface PlaySongPayload {
  song: Song
  /** Base URL prefix Tauri uses to serve local assets */
  assetBase: string
}
