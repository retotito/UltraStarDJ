/**
 * Tauri IPC helpers — window management and cross-window events.
 * All Tauri API calls are isolated here so the rest of the app
 * doesn't need to import from @tauri-apps directly.
 */

import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile, readFile as fsReadFile, exists } from '@tauri-apps/plugin-fs'
import type { PlaySongPayload } from '$lib/ultrastar/types'

// ── Event names ────────────────────────────────────────────────
export const IPC_EVENTS = {
  PLAY_SONG: 'ultrastar:play-song',
  STOP_SONG: 'ultrastar:stop-song',
  PAUSE_SONG: 'ultrastar:pause-song',
  RESUME_SONG: 'ultrastar:resume-song'
} as const

// ── Window labels ──────────────────────────────────────────────
export const WINDOW_LABELS = {
  MAIN: 'main',
  BEAMER: 'beamer'
} as const

// ── Current window ─────────────────────────────────────────────
export function getWindowLabel(): string {
  try {
    return getCurrentWindow().label
  } catch {
    return WINDOW_LABELS.MAIN
  }
}

export function isBeamerWindow(): boolean {
  return getWindowLabel() === WINDOW_LABELS.BEAMER
}

// ── Open beamer window ─────────────────────────────────────────
export async function openBeamerWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(WINDOW_LABELS.BEAMER)
  if (existing) {
    await existing.show()
    await existing.setFocus()
    return
  }

  new WebviewWindow(WINDOW_LABELS.BEAMER, {
    url: '/beamer',
    title: 'UltrastarDJ — Stage',
    fullscreen: false,
    width: 1280,
    height: 720,
    decorations: true,
    resizable: true
  })
}

// ── DJ → Beamer: send song to play ────────────────────────────
export async function sendPlaySong(payload: PlaySongPayload): Promise<void> {
  await emit(IPC_EVENTS.PLAY_SONG, payload)
}

export async function sendStopSong(): Promise<void> {
  await emit(IPC_EVENTS.STOP_SONG, null)
}

export async function sendPauseSong(): Promise<void> {
  await emit(IPC_EVENTS.PAUSE_SONG, null)
}

export async function sendResumeSong(): Promise<void> {
  await emit(IPC_EVENTS.RESUME_SONG, null)
}

// ── Beamer: listen for commands ────────────────────────────────
export function onPlaySong(
  handler: (payload: PlaySongPayload) => void
): Promise<UnlistenFn> {
  return listen<PlaySongPayload>(IPC_EVENTS.PLAY_SONG, e => handler(e.payload))
}

export function onStopSong(handler: () => void): Promise<UnlistenFn> {
  return listen(IPC_EVENTS.STOP_SONG, () => handler())
}

export function onPauseSong(handler: () => void): Promise<UnlistenFn> {
  return listen(IPC_EVENTS.PAUSE_SONG, () => handler())
}

export function onResumeSong(handler: () => void): Promise<UnlistenFn> {
  return listen(IPC_EVENTS.RESUME_SONG, () => handler())
}

// ── File system ────────────────────────────────────────────────

/** Open a native folder picker. Returns the selected path or null. */
export async function pickFolder(): Promise<string | null> {
  const result = await openDialog({ directory: true, multiple: false })
  if (!result) return null
  return typeof result === 'string' ? result : result[0] ?? null
}

/** Recursively collect all .txt file paths under a directory, skipping macOS metadata files. */
export async function listTxtFiles(dirPath: string): Promise<string[]> {
  const paths: string[] = []
  async function walk(dir: string) {
    const entries = await readDir(dir)
    for (const entry of entries) {
      if (!entry.name || entry.name.startsWith('._') || entry.name.startsWith('.')) continue
      const fullPath = `${dir}/${entry.name}`
      if (entry.isDirectory) {
        await walk(fullPath)
      } else if (entry.name.toLowerCase().endsWith('.txt')) {
        paths.push(fullPath)
      }
    }
  }
  await walk(dirPath)
  return paths
}

/** Read a text file as a string. */
export async function readFile(path: string): Promise<string> {
  return readTextFile(path)
}

/** Check if a path exists. */
export async function pathExists(path: string): Promise<boolean> {
  return exists(path)
}

/**
 * Convert an absolute local file path to a media:// URL served by the
 * custom Rust protocol handler. This uses AVFoundation's network stack,
 * enabling MPEG-2 and other formats that blob:/asset: URLs cannot play.
 */
export function toAssetUrl(path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `media://localhost${encoded}`
}

const EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mpg: 'video/mpeg', mpeg: 'video/mpeg', avi: 'video/x-msvideo',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp',
}

/** LRU-ish blob URL cache: path → object URL */
const blobCache = new Map<string, string>()
const CACHE_MAX = 30

/**
 * Read a local file via Tauri fs (which is already permitted) and return
 * a blob: URL. This bypasses the asset protocol and its scope entirely.
 * Returned URLs are cached so the same file isn't read twice per session.
 */
export async function toBlobUrl(path: string): Promise<string> {
  const cached = blobCache.get(path)
  if (cached) return cached
  const data = await fsReadFile(path)
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const type = EXT_MIME[ext] ?? 'application/octet-stream'
  const url = URL.createObjectURL(new Blob([data], { type }))
  if (blobCache.size >= CACHE_MAX) {
    const first = blobCache.keys().next().value
    if (first) { URL.revokeObjectURL(blobCache.get(first)!); blobCache.delete(first) }
  }
  blobCache.set(path, url)
  return url
}

// ── FFmpeg transcoding ─────────────────────────────────────────────────────

/** Video formats that WebKit's HTML5 decoder can't play (MPEG-2, AVI, etc.). */
export const NEEDS_TRANSCODE_EXTS = new Set(['mpg', 'mpeg', 'avi', 'mkv', 'wmv', 'flv'])

export function needsTranscode(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return NEEDS_TRANSCODE_EXTS.has(ext)
}

/**
 * Transcode a video file to a temporary MP4 using the bundled FFmpeg.
 * Returns the temp file path. Call deleteTempFile() when done.
 */
export async function transcodeToMp4(input: string): Promise<string> {
  return await invoke<string>('transcode_to_mp4', { input })
}

/** Delete a previously transcoded temp file. */
export async function deleteTempFile(path: string): Promise<void> {
  await invoke('delete_temp_file', { path })
}
