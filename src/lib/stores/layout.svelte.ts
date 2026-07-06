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
  columns: DEFAULT_COLUMNS
}

let state = $state<LayoutState>({ ...DEFAULTS, columns: DEFAULT_COLUMNS.map(c => ({ ...c })) })

export const layout = {
  get rightPanelWidth()      { return state.rightPanelWidth },
  get showNowPlaying()  { return state.showNowPlaying },
  get columns()              { return state.columns },
  get visibleColumns()       { return state.columns.filter(c => c.visible) },

  setRightPanelWidth(w: number) {
    state.rightPanelWidth = Math.max(220, Math.min(700, w))
  },
  toggleNowPlaying() { state.showNowPlaying = !state.showNowPlaying },
  toggleColumn(key: string) {
    const col = state.columns.find(c => c.key === key)
    if (col) col.visible = !col.visible
  }
}
