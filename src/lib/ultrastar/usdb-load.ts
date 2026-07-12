/**
 * Utility for loading USDB songs on-demand.
 * Fetches the .txt file, parses notes + BPM/GAP/YouTube ID.
 * Auto re-logins if session expired.
 */
import type { Song } from '$lib/ultrastar/types'
import { usdbGetSongTxt } from '$lib/ipc/tauri'
import { parseSongNotes } from '$lib/ultrastar/parser'
import { usdbStore } from '$lib/stores/usdb.svelte'
import { network } from '$lib/stores/network.svelte'

/** True when a song requires an internet connection to play (YouTube only, no local fallback). */
export function requiresInternet(song: Song): boolean {
  // USDB songs always need YouTube (no local files until enriched)
  if (song.sourceId === 'usdb') return true
  // Local songs: need YouTube and have no local audio/video fallback
  return !!song.youtubeId && !song.audioPath && !song.videoPath
}

function looksLikeHtml(txt: string): boolean {
  const t = txt.trimStart().toLowerCase()
  return t.startsWith('<!doctype') || t.startsWith('<html') || t.startsWith('<!')
}

export async function enrichUsdbSong(song: Song): Promise<Song> {
  if (!song.usdbId) return song
  if (!network.isOnline) throw new Error('You\'re offline — this song requires a YouTube connection')
  console.log('[usdb-load] fetching txt for songId=', song.usdbId, song.title)

  let txt = await usdbGetSongTxt(song.usdbId)
  console.log('[usdb-load] txt first 80 chars:', txt.slice(0, 80).replace(/\n/g, '↵'))

  if (looksLikeHtml(txt)) {
    console.warn('[usdb-load] got HTML — session expired, re-logging in')
    const ok = await usdbStore.login()
    if (!ok.ok) throw new Error('USDB session expired and re-login failed: ' + ok.error)
    txt = await usdbGetSongTxt(song.usdbId)
    if (looksLikeHtml(txt)) throw new Error('USDB song txt unavailable after re-login')
  }

  const notes = parseSongNotes(txt)
  let bpm = 0, gap = 0, youtubeId: string | undefined

  for (const line of txt.split('\n')) {
    const t = line.trim()
    if (t.startsWith('#BPM:'))     bpm = parseFloat(t.slice(5).replace(',', '.'))
    if (t.startsWith('#GAP:'))     gap = parseFloat(t.slice(5).replace(',', '.'))
    if (t.startsWith('#YOUTUBE:')) youtubeId = t.slice(9).trim() || undefined
    if (t.startsWith('#VIDEO:') && !youtubeId) {
      const val = t.slice(7).trim()
      const m = val.match(/[?&v=]+([A-Za-z0-9_-]{11})/) ?? val.match(/^([A-Za-z0-9_-]{11})$/)
      if (m) youtubeId = m[1]
    }
  }

  console.log('[usdb-load] bpm=', bpm, 'gap=', gap, 'youtubeId=', youtubeId, 'tracks=', notes.length)
  if (bpm === 0) throw new Error('Missing or invalid #BPM in USDB song txt')
  if (!youtubeId) throw new Error('No YouTube ID found in USDB song txt')

  return { ...song, bpm, gap, youtubeId, notes }
}
