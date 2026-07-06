/**
 * UltraStar .txt file parser.
 * Parses header tags into a partial Song object (metadata only — no notes).
 * Notes are parsed on-demand when a song is about to be played.
 */

import type { Song } from './types'

interface ParsedHeader {
  title?: string
  artist?: string
  bpm?: number
  gap?: number
  mp3?: string
  cover?: string
  background?: string
  video?: string
  videogap?: number
  end?: number
  year?: number
  youtubeId?: string
  language?: string
  genre?: string
  edition?: string
  creator?: string
  comment?: string
}

function parseHeader(text: string): ParsedHeader {
  const header: ParsedHeader = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('#')) break // header ends at first non-tag line
    const colon = trimmed.indexOf(':')
    if (colon === -1) continue
    const key = trimmed.slice(1, colon).trim().toLowerCase()
    const value = trimmed.slice(colon + 1).trim()
    switch (key) {
      case 'title':      header.title = value; break
      case 'artist':     header.artist = value; break
      case 'bpm':        header.bpm = parseFloat(value.replace(',', '.')); break
      case 'gap':        header.gap = parseFloat(value.replace(',', '.')); break
      case 'mp3':
      case 'audio':      header.mp3 = value; break
      case 'cover':      header.cover = value; break
      case 'background': header.background = value; break
      case 'video':
        // Could be a local file or a YouTube URL/ID
        if (extractYoutubeId(value)) {
          header.youtubeId = extractYoutubeId(value)!
        } else {
          header.video = value
        }
        break
      case 'youtube':    header.youtubeId = extractYoutubeId(value) ?? value; break
      case 'videogap':   header.videogap = parseFloat(value.replace(',', '.')); break
      case 'end':        header.end = parseFloat(value.replace(',', '.')); break
      case 'year':       header.year = parseInt(value, 10); break
      case 'language':   header.language = value; break
      case 'genre':      header.genre = value; break
      case 'edition':    header.edition = value; break
      case 'creator':
      case 'author':     header.creator = value; break
      case 'comment':    header.comment = value; break
    }
  }
  return header
}

/** Extract a YouTube video ID from a URL or bare ID, or return null. */
function extractYoutubeId(value: string): string | null {
  // Full URL: https://www.youtube.com/watch?v=XXXXXXXXXXX
  const watchMatch = value.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch) return watchMatch[1]
  // Short URL: https://youtu.be/XXXXXXXXXXX
  const shortMatch = value.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch) return shortMatch[1]
  // Embed URL: https://www.youtube.com/embed/XXXXXXXXXXX
  const embedMatch = value.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  if (embedMatch) return embedMatch[1]
  // Bare 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value
  return null
}


/**
 * Parse the note lines from a UltraStar .txt file into NoteTrack[].
 * Call this on-demand when a song is about to be played.
 */
export function parseSongNotes(text: string): import('./types').NoteTrack[] {
  const lines = text.split('\n')
  const tracks: import('./types').NoteTrack[] = []
  let currentPlayer = 0
  let currentLines: import('./types').LyricLine[] = []
  let currentNotes: import('./types').Note[] = []
  let currentLineStart = 0

  const NOTE_TYPES: Record<string, import('./types').NoteType> = {
    ':': 'normal', '*': 'golden', 'F': 'freestyle', 'R': 'rap', 'G': 'rap-golden',
  }

  function flushLine() {
    if (currentNotes.length > 0) {
      currentLines.push({ startBeat: currentLineStart, notes: currentNotes })
      currentNotes = []
    }
  }

  function flushTrack() {
    flushLine()
    if (currentLines.length > 0) {
      tracks.push({ player: currentPlayer, lines: currentLines })
      currentLines = []
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    if (line === 'P1' || line === 'P 1') { flushTrack(); currentPlayer = 0; continue }
    if (line === 'P2' || line === 'P 2') { flushTrack(); currentPlayer = 1; continue }
    if (line === 'E') { flushTrack(); break }

    const noteType = NOTE_TYPES[line[0]]
    if (noteType) {
      // Split on single space (no trim) — preserves leading/trailing spaces in syllable,
      // which UltraStar uses to encode word boundaries. Same approach as allkaraoke.party.
      const split = line.split(' ')
      const startBeat   = parseInt(split[1], 10)
      const lengthBeats = parseInt(split[2], 10)
      const pitch       = parseInt(split[3], 10)
      const syllable    = split.slice(4).join(' ')
      currentNotes.push({ type: noteType, startBeat, lengthBeats, pitch, syllable })
      continue
    }

    if (line[0] === '-') {
      const parts = line.slice(1).trim().split(/\s+/)
      const nextLineStart = parseInt(parts[0], 10)
      flushLine()
      currentLineStart = nextLineStart
    }
  }

  flushTrack()
  return tracks
}

const SUPPORTED_VIDEO_EXTS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mpg', '.mpeg', '.avi'])

function resolveSibling(txtPath: string, filename: string): string {
  const dir = txtPath.substring(0, txtPath.lastIndexOf('/'))
  return `${dir}/${filename}`
}

/**
 * Parse a UltraStar .txt file into a Song metadata object.
 * @param txtPath  Absolute path to the .txt file
 * @param sourceId ID of the SongSource it belongs to
 * @param text     Raw file contents
 */
export function parseSongHeader(txtPath: string, sourceId: string, text: string): Song | null {
  const header = parseHeader(text)

  if (!header.title || !header.artist) return null

  // Debug: log raw header tags for this song
  console.debug('[parser] raw header tags:', txtPath, header)

  const id = `${sourceId}::${txtPath}`

  return {
    id,
    sourceId,
    title: header.title,
    artist: header.artist,
    bpm: header.bpm ?? 120,
    gap: header.gap ?? 0,
    year: header.year,
    language: header.language,
    genre: header.genre,
    edition: header.edition,
    creator: header.creator,
    comment: header.comment,
    txtPath,
    audioPath:      header.mp3        ? resolveSibling(txtPath, header.mp3)        : undefined,
    coverPath:      header.cover      ? resolveSibling(txtPath, header.cover)      : undefined,
    backgroundPath: header.background ? resolveSibling(txtPath, header.background) : undefined,
    videoPath:      header.video && SUPPORTED_VIDEO_EXTS.has(header.video.toLowerCase().slice(header.video.lastIndexOf('.'))) ? resolveSibling(txtPath, header.video) : undefined,
    videoGap:       header.videogap,
    end:            header.end,
    youtubeId:      header.youtubeId,
  }
}
