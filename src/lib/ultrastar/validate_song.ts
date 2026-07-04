/**
 * Song validation — runs before load or queue-add.
 * Returns a patched Song copy with missing optional files nulled out,
 * so the loader's fallback chain works automatically.
 */

import type { Song } from './types'
import { pathExists, readFile } from '$lib/ipc/tauri'

export interface SongValidationError {
  field: string
  message: string
}

export interface SongValidationResult {
  valid: boolean
  errors: SongValidationError[]
  song: Song   // patched copy — always use this for loading, not the original
}

function isRemotePath(p: string): boolean {
  return p.startsWith('http://') || p.startsWith('https://')
}

async function fileExists(path: string): Promise<boolean> {
  return pathExists(path).catch((e) => { console.warn('[validateSong] pathExists threw:', e); return false })
}

export async function validateSong(song: Song): Promise<SongValidationResult> {
  const t = performance.now().toFixed(0)
  console.log(`[validateSong ${t}ms] "${song.title}" — audio:${song.audioPath} video:${song.videoPath} yt:${song.youtubeId}`)
  const errors: SongValidationError[] = []
  const patched: Song = { ...song }

  // ── TXT format checks (no I/O) ──────────────────────────────────────────
  if (!song.title?.trim()) {
    errors.push({ field: 'title', message: 'Missing required tag: #TITLE' })
  }
  if (!song.artist?.trim()) {
    errors.push({ field: 'artist', message: 'Missing required tag: #ARTIST' })
  }
  if (!song.bpm || song.bpm <= 0 || !isFinite(song.bpm)) {
    errors.push({ field: 'bpm', message: 'Missing or invalid #BPM — notes cannot be timed' })
  }

  // ── Notes check (read txt, check for at least one note line) ───────────
  if (song.txtPath) {
    try {
      const txt = await readFile(song.txtPath)
      const hasNotes = txt.split('\n').some(l => l.trimStart().startsWith(':'))
      if (!hasNotes) errors.push({ field: 'notes', message: 'Song has no singable notes' })
    } catch {
      // txt unreadable — format checks above already cover missing title/bpm
    }
  }

  // ── File existence + patching ───────────────────────────────────────────
  // audioPath: if missing but a fallback exists → patch it out so loader skips it
  if (song.audioPath && !isRemotePath(song.audioPath)) {
    const ok = await fileExists(song.audioPath)
    console.log(`[validateSong] audioPath exists=${ok}`)
    if (!ok) {
      if (song.videoPath || song.youtubeId) {
        console.log(`[validateSong] audioPath missing but fallback available — patching out`)
        patched.audioPath = undefined
      } else {
        errors.push({ field: 'audioPath', message: `Audio file not found: ${song.audioPath}` })
      }
    }
  }

  // videoPath: if missing AND it's the sole audio source → block
  //            if missing but audioPath or youtubeId exists → patch it out (no video bg, still plays)
  if (song.videoPath && !isRemotePath(song.videoPath)) {
    const ok = await fileExists(song.videoPath)
    console.log(`[validateSong] videoPath exists=${ok}`)
    if (!ok) {
      if (!song.audioPath && !song.youtubeId) {
        errors.push({ field: 'videoPath', message: `Video file not found (sole audio source): ${song.videoPath}` })
      } else {
        console.log(`[validateSong] videoPath missing but audio fallback exists — patching out`)
        patched.videoPath = undefined
      }
    }
  }

  // ── Final: ensure at least one audio source remains after patching ──────
  if (!patched.audioPath && !patched.videoPath && !patched.youtubeId) {
    errors.push({ field: 'audio', message: 'No playable audio source — all files are missing' })
  }

  const valid = errors.length === 0
  if (valid) {
    console.log(`[validateSong] ✓ valid${patched.audioPath !== song.audioPath || patched.videoPath !== song.videoPath ? ' (patched)' : ''}`)
  } else {
    console.warn(`[validateSong] ✗ ${errors.length} error(s):`, errors.map(e => e.message))
  }
  return { valid, errors, song: patched }
}
