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
  if (!song.audioPath && !song.youtubeId) {
    errors.push({ field: 'audio', message: 'No audio source — song has no audio file and no YouTube link' })
  }

  // ── File existence checks (local paths only) ───────────────────────────
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

  if (song.videoPath && !isRemotePath(song.videoPath)) {
    const ok = await pathExists(song.videoPath).catch((e) => { console.warn('[validateSong] pathExists threw:', e); return false })
    console.log(`[validateSong] videoPath exists=${ok} — ${song.videoPath}`)
    if (!ok) errors.push({ field: 'videoPath', message: `Video file not found: ${song.videoPath}` })
  }

  if (song.backgroundPath && !isRemotePath(song.backgroundPath)) {
    const ok = await pathExists(song.backgroundPath).catch((e) => { console.warn('[validateSong] pathExists threw:', e); return false })
    console.log(`[validateSong] backgroundPath exists=${ok} — ${song.backgroundPath}`)
    if (!ok) errors.push({ field: 'backgroundPath', message: `Background image not found: ${song.backgroundPath}` })
  }

  if (song.coverPath && !isRemotePath(song.coverPath)) {
    const ok = await pathExists(song.coverPath).catch((e) => { console.warn('[validateSong] pathExists threw:', e); return false })
    console.log(`[validateSong] coverPath exists=${ok} — ${song.coverPath}`)
    if (!ok) errors.push({ field: 'coverPath', message: `Cover image not found: ${song.coverPath}` })
  }

  const result = { valid: errors.length === 0, errors }
  if (result.valid) {
    console.log(`[validateSong] ✓ valid`)
  } else {
    console.warn(`[validateSong] ✗ ${errors.length} error(s):`, errors.map(e => e.message))
  }
  return result
}
