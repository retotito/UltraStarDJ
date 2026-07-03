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
  rightPlayerHeightPct: number
  showPlayer: boolean
  showQueue: boolean
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
  rightPlayerHeightPct: 40,
  showPlayer: true,
  showQueue: true,
  showNowPlaying: true,
  columns: DEFAULT_COLUMNS
}

let state = $state<LayoutState>({ ...DEFAULTS, columns: DEFAULT_COLUMNS.map(c => ({ ...c })) })

export const layout = {
  get rightPanelWidth()      { return state.rightPanelWidth },
  get rightPlayerHeightPct() { return state.rightPlayerHeightPct },
  get showPlayer()      { return state.showPlayer },
  get showQueue()       { return state.showQueue },
  get showNowPlaying()  { return state.showNowPlaying },
  get columns()              { return state.columns },
  get visibleColumns()       { return state.columns.filter(c => c.visible) },

  setRightPanelWidth(w: number) {
    state.rightPanelWidth = Math.max(220, Math.min(700, w))
  },
  setRightPlayerHeightPct(pct: number) {
    state.rightPlayerHeightPct = Math.max(20, Math.min(80, pct))
  },
  togglePlayer()     { state.showPlayer     = !state.showPlayer },
  toggleQueue()      { state.showQueue      = !state.showQueue },
  toggleNowPlaying() { state.showNowPlaying = !state.showNowPlaying },
  toggleColumn(key: string) {
    const col = state.columns.find(c => c.key === key)
    if (col) col.visible = !col.visible
  }
}
