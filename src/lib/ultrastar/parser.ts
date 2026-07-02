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
      case 'videogap':   header.videogap = parseFloat(value.replace(',', '.')); break
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
    videoPath:      header.video      ? resolveSibling(txtPath, header.video)      : undefined,
    videoGap:       header.videogap,
    youtubeId:      header.youtubeId,
  }
}
