<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { onPlaySong, onPreviewSong, onStopSong, onPauseSong, onResumeSong, onScreenConfig, onTimeTick, getWindowLabel } from '$lib/ipc/tauri'
  import type { UnlistenFn } from '@tauri-apps/api/event'
  import type { PlaySongPayload, PreviewSongPayload } from '$lib/ultrastar/types'
  import BeamerView from '$components/game/BeamerView.svelte'

  export type BeamerScreen = 'idle' | 'preview' | 'countdown' | 'playing' | 'paused' | 'score'

  let screen = $state<BeamerScreen>('idle')
  let currentPayload = $state<PlaySongPayload | PreviewSongPayload | null>(null)
  let assignedPlayerIds = $state<number[]>([])
  let currentTime = $state(0)
  let unlisteners: UnlistenFn[] = []

  const windowLabel = getWindowLabel()

  onMount(async () => {
    unlisteners = await Promise.all([
      onPreviewSong(payload => {
        if (payload.windowLabel !== windowLabel) return
        currentPayload = payload
        assignedPlayerIds = payload.playerIds
        screen = 'preview'
      }),
      onPlaySong(payload => {
        if (payload.windowLabel !== windowLabel) return
        currentPayload = payload
        assignedPlayerIds = payload.playerIds
        screen = 'countdown'
      }),
      onStopSong(() => {
        if (screen === 'playing' || screen === 'paused' || screen === 'countdown') {
          screen = 'score'
        } else if (screen === 'preview') {
          screen = 'idle'
          currentPayload = null
          assignedPlayerIds = []
        } else if (screen === 'score') {
          screen = 'idle'
          currentPayload = null
          assignedPlayerIds = []
        }
      }),
      onPauseSong(() => { if (screen === 'playing') screen = 'paused' }),
      onResumeSong(() => { if (screen === 'paused') screen = 'playing' }),
      onScreenConfig(cfg => {
        if (cfg.windowLabel === windowLabel && screen === 'idle') {
          assignedPlayerIds = cfg.playerIds
        }
      }),
      onTimeTick(t => { currentTime = t }),
    ])
  })

  onDestroy(() => unlisteners.forEach(fn => fn()))

  function onCountdownDone() {
    screen = 'playing'
  }
</script>

<BeamerView {screen} payload={currentPayload} {assignedPlayerIds} {currentTime} onCountdownDone={onCountdownDone} />

