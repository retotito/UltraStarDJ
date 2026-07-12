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
import type { PlaySongPayload, PreviewSongPayload } from '$lib/ultrastar/types'

// ── Event names ────────────────────────────────────────────────
export const IPC_EVENTS = {
  PLAY_SONG:       'ultrastar:play-song',
  PREVIEW_SONG:    'ultrastar:preview-song',
  STOP_SONG:       'ultrastar:stop-song',
  PAUSE_SONG:      'ultrastar:pause-song',
  RESUME_SONG:     'ultrastar:resume-song',
  SCREEN_CONFIG:   'ultrastar:screen-config',
  TIME_TICK:       'ultrastar:time-tick',
  COUNTDOWN_DONE:  'ultrastar:countdown-done',
  BEAMER_READY:    'ultrastar:beamer-ready',
  BEAMER_SETTINGS: 'ultrastar:beamer-settings',
  PITCH_TICK:      'ultrastar:pitch-tick',
} as const

// ── Window labels ──────────────────────────────────────────────
export const WINDOW_LABELS = {
  MAIN:    'main',
  BEAMER:  'beamer',
  BEAMER2: 'beamer2',
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
  return getWindowLabel() === WINDOW_LABELS.BEAMER ||
         getWindowLabel() === WINDOW_LABELS.BEAMER2
}

export interface ScreenConfigPayload {
  windowLabel: string
  playerIds: number[]
}

// ── Open / close display windows ───────────────────────────────
async function openDisplayWindow(label: string, title: string, url: string): Promise<void> {
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.show()
    await existing.setFocus()
    return
  }
  new WebviewWindow(label, {
    url,
    title,
    fullscreen: false,
    width: 1280,
    height: 720,
    decorations: true,
    resizable: true,
  })
}

export async function openBeamerWindow(): Promise<void> {
  await openDisplayWindow(WINDOW_LABELS.BEAMER, 'UltrastarDJ — Display 1', '/beamer')
}

export async function openBeamer2Window(): Promise<void> {
  await openDisplayWindow(WINDOW_LABELS.BEAMER2, 'UltrastarDJ — Display 2', '/beamer')
}

export async function closeDisplayWindow(label: string): Promise<void> {
  const win = await WebviewWindow.getByLabel(label)
  if (win) await win.close()
}

// ── Display window close detection ────────────────────────────
/** Calls handler with the closed window's label whenever a display window is destroyed. */
/** Listen for close on a specific display window by label. */
export async function watchDisplayWindow(label: string, onClosed: () => void): Promise<UnlistenFn> {
  return listen('tauri://destroyed', () => onClosed(), {
    target: { kind: 'Window', label },
  })
}

// ── Screen config ──────────────────────────────────────────────
export async function sendScreenConfig(payload: ScreenConfigPayload): Promise<void> {
  await emit(IPC_EVENTS.SCREEN_CONFIG, payload)
}

export function onScreenConfig(
  handler: (payload: ScreenConfigPayload) => void
): Promise<UnlistenFn> {
  return listen<ScreenConfigPayload>(IPC_EVENTS.SCREEN_CONFIG, e => handler(e.payload))
}

// ── DJ → Beamer: send song to play ────────────────────────────
export async function sendPlaySong(payload: PlaySongPayload): Promise<void> {
  await emit(IPC_EVENTS.PLAY_SONG, payload)
}

export async function sendPreviewSong(payload: PreviewSongPayload): Promise<void> {
  await emit(IPC_EVENTS.PREVIEW_SONG, payload)
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

export function onPreviewSong(
  handler: (payload: PreviewSongPayload) => void
): Promise<UnlistenFn> {
  return listen<PreviewSongPayload>(IPC_EVENTS.PREVIEW_SONG, e => handler(e.payload))
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

export async function sendTimeTick(currentTime: number): Promise<void> {
  await emit(IPC_EVENTS.TIME_TICK, { currentTime })
}

export async function sendCountdownDone(): Promise<void> {
  await emit(IPC_EVENTS.COUNTDOWN_DONE, {})
}

// ── Beamer display settings ─────────────────────────────────────
export interface BeamerSettingsPayload {
  showPianoRollLines: boolean
  showNoteSyllables: boolean
  noteBarStyle: 'white' | 'black'
}

export async function sendBeamerSettings(payload: BeamerSettingsPayload): Promise<void> {
  await emit(IPC_EVENTS.BEAMER_SETTINGS, payload)
}

export function onBeamerSettings(
  handler: (payload: BeamerSettingsPayload) => void
): Promise<UnlistenFn> {
  return listen<BeamerSettingsPayload>(IPC_EVENTS.BEAMER_SETTINGS, e => handler(e.payload))
}

export function onCountdownDone(handler: () => void): Promise<UnlistenFn> {
  return listen(IPC_EVENTS.COUNTDOWN_DONE, () => handler())
}

export async function sendBeamerReady(): Promise<void> {
  await emit(IPC_EVENTS.BEAMER_READY, {})
}

// ── Pitch tick ─────────────────────────────────────────────────
export interface PitchTickEntry {
  playerId:      number
  beat:          number   // current beat position (float)
  midiNote:      number   // latest detected pitch (-1 = silence)
  correct:       boolean  // was this beat correct?
  isFirstInNote: boolean  // first beat of a new note
  noteType:      string   // 'normal' | 'golden' | 'rap' | 'rap-golden' | 'freestyle'
  rowPitch:      number   // pitch row for mic dot on canvas (-1 = hide)
  score:         number   // accumulated score
  maxScore:      number
}

export interface PitchTickPayload {
  ticks: PitchTickEntry[]
  beat:  number
}

export async function sendPitchTick(payload: PitchTickPayload): Promise<void> {
  await emit(IPC_EVENTS.PITCH_TICK, payload)
}

export function onPitchTick(
  handler: (payload: PitchTickPayload) => void
): Promise<UnlistenFn> {
  return listen<PitchTickPayload>(IPC_EVENTS.PITCH_TICK, e => handler(e.payload))
}

export function onBeamerReady(handler: () => void): Promise<UnlistenFn> {
  return listen(IPC_EVENTS.BEAMER_READY, () => handler())
}

export function onTimeTick(
  handler: (currentTime: number) => void
): Promise<UnlistenFn> {
  return listen<{ currentTime: number }>(IPC_EVENTS.TIME_TICK, e => handler(e.payload.currentTime))
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
  // Split on path separators, encode each segment, then also encode apostrophes
  // (encodeURIComponent intentionally skips ' but Plyr wraps poster in url('...')
  // which breaks if the URL contains a literal apostrophe)
  const encoded = path.split('/').map(s => encodeURIComponent(s).replace(/'/g, '%27')).join('/')
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

// ── Audio / Mic ────────────────────────────────────────────────────────────

export interface AudioInputDevice {
  id: string
  name: string
  channels: number
}

export interface MicLevelEvent {
  player_id: number
  rms: number // 0.0 – 1.0
}

export interface MicPcmPayload {
  player_id: number
  samples: number[]
  sample_rate: number
}

export function onMicPcm(handler: (payload: MicPcmPayload) => void): Promise<UnlistenFn> {
  return listen<MicPcmPayload>('mic:pcm', e => handler(e.payload))
}

export interface MicDisconnectedEvent {
  device_id: string
  player_id: number
}

export interface MicReconnectedEvent {
  device_id: string
  player_id: number // 0 = unknown player (device just appeared)
}

export const MIC_EVENTS = {
  LEVEL: 'mic:level',
  DISCONNECTED: 'mic:disconnected',
  RECONNECTED: 'mic:reconnected',
  DEVICES_CHANGED: 'mic:devices-changed',
} as const

export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  return await invoke<AudioInputDevice[]>('list_audio_input_devices')
}

/** Start streaming RMS level events for a player's mic. channel: 'left' | 'right' | 'mono' */
export async function startMicMonitor(
  deviceId: string,
  channel: 'left' | 'right' | 'mono',
  playerId: number,
  threshold = 0.1,
  inputGain = 1.0,
): Promise<void> {
  await invoke('start_mic_monitor', { deviceId, channel, playerId, threshold, inputGain })
}

export async function stopMicMonitor(playerId: number): Promise<void> {
  console.log(`[ipc] stopMicMonitor → player ${playerId}`)
  await invoke('stop_mic_monitor', { playerId })
  console.log(`[ipc] stopMicMonitor ✓ player ${playerId}`)
  const open = await invoke<string[]>('debug_open_streams')
  console.log(`[ipc] open streams after stop:`, open.length === 0 ? '(none)' : open)
}

export async function setMicMixGain(playerId: number, gain: number): Promise<void> {
  await invoke('set_mic_mix_gain', { playerId, gain })
}

export async function setMicInputGain(playerId: number, gain: number): Promise<void> {
  await invoke('set_mic_input_gain', { playerId, gain })
}

export async function setMicThreshold(playerId: number, threshold: number): Promise<void> {
  await invoke('set_mic_threshold', { playerId, threshold })
}

/** Open a dedicated cpal output channel to the default device for mic→speaker routing. */
export async function openMicMixChannel(): Promise<void> {
  await invoke('open_output_channel', { channel: 'mic-mix', deviceId: '', jsSampleRate: 44100, jsChannels: 2 })
}

/** Close the mic-mix output channel. */
export async function closeMicMixChannel(): Promise<void> {
  await invoke('close_output_channel', { channel: 'mic-mix' })
}

export function onMicLevel(cb: (e: MicLevelEvent) => void): Promise<UnlistenFn> {
  return listen<MicLevelEvent>(MIC_EVENTS.LEVEL, e => cb(e.payload))
}

export function onMicDisconnected(cb: (e: MicDisconnectedEvent) => void): Promise<UnlistenFn> {
  return listen<MicDisconnectedEvent>(MIC_EVENTS.DISCONNECTED, e => cb(e.payload))
}

export function onMicReconnected(cb: (e: MicReconnectedEvent) => void): Promise<UnlistenFn> {
  return listen<MicReconnectedEvent>(MIC_EVENTS.RECONNECTED, e => cb(e.payload))
}

export function onDevicesChanged(cb: (devices: AudioInputDevice[]) => void): Promise<UnlistenFn> {
  return listen<AudioInputDevice[]>(MIC_EVENTS.DEVICES_CHANGED, e => cb(e.payload))
}

export function onOutputDevicesChanged(cb: () => void): Promise<UnlistenFn> {
  return listen('audio:output-devices-changed', () => cb())
}

// ── USDB ──────────────────────────────────────────────────────────────────────

export interface UsdbCatalogEntry {
  songId:      number
  artist:      string
  title:       string
  genre:       string
  year:        number | null
  language:    string
  creator:     string
  edition:     string
  goldenNotes: boolean
  rating:      number
  views:       number
  coverUrl:    string | null
  usdbMtime:   number
}

/** Login to USDB. Returns true on success, false on wrong credentials. */
export async function usdbLogin(username: string, password: string): Promise<boolean> {
  return await invoke<boolean>('usdb_login', { username, password })
}

/** Fetch catalog entries. Pass lastMtime=0 for full sync, >0 for incremental. */
export async function usdbFetchCatalog(
  lastMtime: number,
  lastSongIds: number[]
): Promise<UsdbCatalogEntry[]> {
  return await invoke<UsdbCatalogEntry[]>('usdb_fetch_catalog', { lastMtime, lastSongIds })
}

/** Fetch the raw .txt content for a USDB song. Throws if song not found. */
export async function usdbGetSongTxt(songId: number): Promise<string> {
  return await invoke<string>('usdb_get_song_txt', { songId })
}

