/**
 * Global error store — shows a single error modal anywhere in the app.
 * Usage: errorStore.show('Title', ['Error line 1', 'Error line 2'])
 */

interface ErrorState {
  open: boolean
  title: string
  messages: string[]
}

let state = $state<ErrorState>({ open: false, title: '', messages: [] })

export const errorStore = {
  get open()     { return state.open },
  get title()    { return state.title },
  get messages() { return state.messages },

  show(title: string, messages: string[]) {
    state = { open: true, title, messages }
  },

  dismiss() {
    state = { open: false, title: '', messages: [] }
  },
}
