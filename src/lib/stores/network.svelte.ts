/**
 * Network status store — reactive online/offline detection.
 */

const state = $state({ online: typeof navigator !== 'undefined' ? navigator.onLine : true })

if (typeof window !== 'undefined') {
  window.addEventListener('online',  () => { state.online = true })
  window.addEventListener('offline', () => { state.online = false })
}

export const network = {
  get isOnline() { return state.online }
}
