/**
 * Tauri IPC helpers — window management and cross-window events.
 * All Tauri API calls are isolated here so the rest of the app
 * doesn't need to import from @tauri-apps directly.
 */

import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile, exists } from '@tauri-apps/plugin-fs'
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

/** Recursively collect all .txt file paths under a directory. */
export async function listTxtFiles(dirPath: string): Promise<string[]> {
  const paths: string[] = []
  async function walk(dir: string) {
    const entries = await readDir(dir)
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`
      if (entry.isDirectory) {
        await walk(fullPath)
      } else if (entry.name?.toLowerCase().endsWith('.txt')) {
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
