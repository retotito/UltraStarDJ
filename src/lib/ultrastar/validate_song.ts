/**
 * Song validation — runs before load or queue-add.
 * Checks both TXT format (from parsed Song fields) and file existence.
 */

import type { Song } from './types'
import { pathExists } from '$lib/ipc/tauri'

export interface SongValidationError {
  field: string
  message: string
}

export interface SongValidationResult {
  valid: boolean
  errors: SongValidationError[]
}

function isRemotePath(p: string): boolean {
  return p.startsWith('http://') || p.startsWith('https://')
}

export async function validateSong(song: Song): Promise<SongValidationResult> {
  const t = performance.now().toFixed(0)
  console.log(`[validateSong ${t}ms] start — "${song.title}" by ${song.artist}`)
  console.log(`[validateSong] paths — txt:${song.txtPath} audio:${song.audioPath} video:${song.videoPath} cover:${song.coverPath} bg:${song.backgroundPath}`)
  const errors: SongValidationError[] = []

  // ── TXT format checks (from parsed Song fields, no I/O) ─────────────────
  if (!song.title?.trim()) {
    errors.push({ field: 'title', message: 'Missing required tag: #TITLE' })
  }
  if (!song.artist?.trim()) {
    errors.push({ field: 'artist', message: 'Missing required tag: #ARTIST' })
  }
  if (!song.bpm || song.bpm <= 0 || !isFinite(song.bpm)) {
    errors.push({ field: 'bpm', message: 'Missing or invalid #BPM — notes cannot be timed' })
  }

  // ── Audio source check ──────────────────────────────────────────────────
  if (!song.audioPath && !song.youtubeId && !song.videoPath) {
    errors.push({ field: 'audio', message: 'No audio source — song has no audio file, no video file and no YouTube link' })
  }

  // ── File existence checks ───────────────────────────────────────────────
  // Only check files that directly affect playback. Cosmetic files (cover,
  // background) are skipped — a song plays fine without them.

  if (song.txtPath) {
    const ok = await pathExists(song.txtPath).catch((e) => { console.warn('[validateSong] pathExists threw:', e); return false })
    console.log(`[validateSong] txtPath exists=${ok} — ${song.txtPath}`)
    if (!ok) errors.push({ field: 'txtPath', message: `Song file (.txt) not found: ${song.txtPath}` })
  }

  if (song.audioPath && !isRemotePath(song.audioPath)) {
    const ok = await pathExists(song.audioPath).catch((e) => { console.warn('[validateSong] pathExists threw:', e); return false })
    console.log(`[validateSong] audioPath exists=${ok} — ${song.audioPath}`)
    if (!ok) errors.push({ field: 'audioPath', message: `Audio file not found: ${song.audioPath}` })
  }

  // Only check videoPath existence when it is the sole audio source (no audioPath, no youtubeId).
  // If audioPath or youtubeId is present, a missing video just means no video background — still playable.
  if (song.videoPath && !isRemotePath(song.videoPath) && !song.audioPath && !song.youtubeId) {
    const ok = await pathExists(song.videoPath).catch((e) => { console.warn('[validateSong] pathExists threw:', e); return false })
    console.log(`[validateSong] videoPath (sole audio source) exists=${ok} — ${song.videoPath}`)
    if (!ok) errors.push({ field: 'videoPath', message: `Video file not found (sole audio source): ${song.videoPath}` })
  }

  const result = { valid: errors.length === 0, errors }
  if (result.valid) {
    console.log(`[validateSong] ✓ valid`)
  } else {
    console.warn(`[validateSong] ✗ ${errors.length} error(s):`, errors.map(e => e.message))
  }
  return result
}
