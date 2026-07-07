/**
 * Layout store — UI panel sizes, column visibility, widget toggles.
 * Persisted to localStorage (Tauri Store plugin later).
 */

export interface ColumnConfig {
  key: string
  label: string
  visible: boolean
}

export interface LayoutState {
  rightPanelWidth: number
  showNowPlaying: boolean
  showPianoRollLines: boolean
  columns: ColumnConfig[]
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'index',    label: '#',        visible: true },
  { key: 'title',    label: 'Title',    visible: true },
  { key: 'artist',   label: 'Artist',   visible: true },
  { key: 'year',     label: 'Year',     visible: true },
  { key: 'language', label: 'Language', visible: true },
  { key: 'bpm',      label: 'BPM',      visible: false },
  { key: 'genre',    label: 'Genre',    visible: false },
  { key: 'source',   label: 'Source',   visible: false },
]

const DEFAULTS: LayoutState = {
  rightPanelWidth: 380,
  showNowPlaying: false,
  showPianoRollLines: true,
  columns: DEFAULT_COLUMNS
}

const STORAGE_KEY = 'ultrastardj:layout'

function loadState(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS, columns: DEFAULT_COLUMNS.map(c => ({ ...c })) }
    const saved = JSON.parse(raw) as Partial<LayoutState>
    // Merge saved column visibility into defaults (handles new columns added in future)
    const columns = DEFAULT_COLUMNS.map(def => {
      const savedCol = (saved.columns ?? []).find(c => c.key === def.key)
      return savedCol ? { ...def, visible: savedCol.visible } : { ...def }
    })
    return {
      rightPanelWidth: saved.rightPanelWidth ?? DEFAULTS.rightPanelWidth,
      showNowPlaying: saved.showNowPlaying ?? DEFAULTS.showNowPlaying,
      showPianoRollLines: saved.showPianoRollLines ?? DEFAULTS.showPianoRollLines,
      columns,
    }
  } catch {
    return { ...DEFAULTS, columns: DEFAULT_COLUMNS.map(c => ({ ...c })) }
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* storage full or unavailable */ }
}

let state = $state<LayoutState>(loadState())

export const layout = {
  get rightPanelWidth()      { return state.rightPanelWidth },
  get showNowPlaying()  { return state.showNowPlaying },
  get showPianoRollLines() { return state.showPianoRollLines },
  get columns()              { return state.columns },
  get visibleColumns()       { return state.columns.filter(c => c.visible) },

  setRightPanelWidth(w: number) {
    state.rightPanelWidth = Math.max(220, Math.min(700, w))
    persist()
  },
  toggleNowPlaying() { state.showNowPlaying = !state.showNowPlaying; persist() },
  togglePianoRollLines() { state.showPianoRollLines = !state.showPianoRollLines; persist() },
  toggleColumn(key: string) {
    const col = state.columns.find(c => c.key === key)
    if (col) { col.visible = !col.visible; persist() }
  }
}
