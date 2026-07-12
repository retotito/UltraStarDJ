/**
 * Utility for loading USDB songs on-demand.
 * Fetches the .txt file, parses notes + BPM/GAP/YouTube ID.
 */
import type { Song } from '$lib/ultrastar/types'
import { usdbGetSongTxt } from '$lib/ipc/tauri'
import { parseSongNotes } from '$lib/ultrastar/parser'

/** For USDB songs: fetch .txt, parse notes + extract YouTube ID, return enriched Song. */
export async function enrichUsdbSong(song: Song): Promise<Song> {
  if (!song.usdbId) return song
  console.log('[usdb-load] fetching txt for songId=', song.usdbId, song.title)
  const txt = await usdbGetSongTxt(song.usdbId)
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
  console.log('[usdb-load] parsed: bpm=', bpm, 'gap=', gap, 'youtubeId=', youtubeId)
  return { ...song, bpm, gap, youtubeId, notes }
}
