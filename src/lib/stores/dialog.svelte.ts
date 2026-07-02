/**
 * Dialog / Modal store (Svelte 5 runes)
 * Usage: openDialog('settings') / closeDialog()
 */

export interface DialogState {
  id: string | null
  props: Record<string, unknown>
}

let state = $state<DialogState>({ id: null, props: {} })

export const dialog = {
  get current() { return state.id },
  get props() { return state.props },
  open(id: string, props: Record<string, unknown> = {}) {
    state = { id, props }
  },
  close() {
    state = { id: null, props: {} }
  }
}

export function openDialog(id: string, props: Record<string, unknown> = {}) {
  dialog.open(id, props)
}

export function closeDialog() {
  dialog.close()
}
