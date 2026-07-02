/**
 * Settings store (Svelte 5 runes)
 * Persisted to Tauri store plugin (or localStorage fallback).
 */

export interface SongSource {
  id: string
  type: 'local-folder' | 'usdb' | 'custom'
  label: string
  /** For local-folder: the directory path */
  path?: string
  enabled: boolean
}

export interface AppSettings {
  theme: 'dark' | 'light'
  sources: SongSource[]
  beamerMonitorIndex: number
  /** Offset in ms applied to lyrics vs audio */
  lyricsOffsetMs: number
  /** Volume 0–1 */
  volume: number
}

const DEFAULTS: AppSettings = {
  theme: 'dark',
  sources: [],
  beamerMonitorIndex: 1,
  lyricsOffsetMs: 0,
  volume: 1
}

let settings = $state<AppSettings>({ ...DEFAULTS })

export const appSettings = {
  get theme() { return settings.theme },
  get sources() { return settings.sources },
  get beamerMonitorIndex() { return settings.beamerMonitorIndex },
  get lyricsOffsetMs() { return settings.lyricsOffsetMs },
  get volume() { return settings.volume },

  setTheme(theme: AppSettings['theme']) {
    settings.theme = theme
    document.documentElement.classList.toggle('light', theme === 'light')
  },
  addSource(source: SongSource) {
    settings.sources = [...settings.sources, source]
  },
  removeSource(id: string) {
    settings.sources = settings.sources.filter(s => s.id !== id)
  },
  toggleSource(id: string) {
    settings.sources = settings.sources.map(s =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    )
  },
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    settings[key] = value
  },

  /** Load from localStorage (Tauri store plugin replaces this later) */
  load() {
    try {
      const raw = localStorage.getItem('ultrastardj-settings')
      if (raw) Object.assign(settings, JSON.parse(raw))
      document.documentElement.classList.toggle('light', settings.theme === 'light')
    } catch {}
  },
  save() {
    try {
      localStorage.setItem('ultrastardj-settings', JSON.stringify(settings))
    } catch {}
  }
}
