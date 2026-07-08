/**
 * Settings store (Svelte 5 runes)
 * Persisted to Tauri store plugin (or localStorage fallback).
 */

export type Difficulty = 'easy' | 'medium' | 'hard'

/** Semitone tolerance per difficulty level (octave-invariant matching, matches TunePerfect / USDX) */
export const DIFFICULTY_TOLERANCE: Record<Difficulty, number> = {
  easy:   2,
  medium: 1,
  hard:   0.5,  // with integer MIDI: effectively requires exact semitone match
}

export interface SongSource {
  id: string
  type: 'local-folder' | 'usdb' | 'custom'
  label: string
  /** For local-folder: the directory path */
  path?: string
  enabled: boolean
  /** Last known song count — persisted so it shows even when disabled */
  lastCount?: number
  /** Whether the source path is currently reachable */
  available?: boolean
}

export interface AppSettings {
  theme: 'dark' | 'light'
  sources: SongSource[]
  beamerMonitorIndex: number
  /** Offset in ms applied to lyrics vs audio */
  lyricsOffsetMs: number
  /** Volume 0–1 */
  volume: number
  /** Pitch matching difficulty */
  difficulty: Difficulty
  /** Global mic input latency offset in milliseconds (0–300). Shifts the beat
   *  comparison window back so pitch is matched against the correct note. */
  micDelay: number
}

const DEFAULTS: AppSettings = {
  theme: 'dark',
  sources: [],
  beamerMonitorIndex: 1,
  lyricsOffsetMs: 0,
  volume: 1,
  difficulty: 'medium',
  micDelay: 0,
}

let settings = $state<AppSettings>({ ...DEFAULTS })

export const appSettings = {
  get theme() { return settings.theme },
  get sources() { return settings.sources },
  get beamerMonitorIndex() { return settings.beamerMonitorIndex },
  get lyricsOffsetMs() { return settings.lyricsOffsetMs },
  get volume() { return settings.volume },
  get difficulty() { return settings.difficulty },
  get micDelay() { return settings.micDelay },

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
  renameSource(id: string, label: string) {
    settings.sources = settings.sources.map(s =>
      s.id === id ? { ...s, label } : s
    )
  },
  updateSourceCount(id: string, count: number) {
    settings.sources = settings.sources.map(s =>
      s.id === id ? { ...s, lastCount: count } : s
    )
  },
  updateSourceAvailability(id: string, available: boolean) {
    settings.sources = settings.sources.map(s =>
      s.id === id ? { ...s, available } : s
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
