<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { onPlaySong, onStopSong, onPauseSong, onResumeSong, onScreenConfig, getWindowLabel } from '$lib/ipc/tauri'
  import type { UnlistenFn } from '@tauri-apps/api/event'
  import type { PlaySongPayload } from '$lib/ultrastar/types'
  import BeamerView from '$components/game/BeamerView.svelte'

  export type BeamerScreen = 'idle' | 'countdown' | 'playing' | 'paused' | 'score'

  let screen = $state<BeamerScreen>('idle')
  let currentPayload = $state<PlaySongPayload | null>(null)
  let assignedPlayerIds = $state<number[]>([])
  let unlisteners: UnlistenFn[] = []

  const windowLabel = getWindowLabel()

  onMount(async () => {
    unlisteners = await Promise.all([
      onPlaySong(payload => {
        currentPayload = payload
        assignedPlayerIds = payload.playerIds
        screen = 'countdown'
      }),
      onStopSong(() => {
        if (screen === 'playing' || screen === 'paused' || screen === 'countdown') {
          screen = 'score'
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
    ])
  })

  onDestroy(() => unlisteners.forEach(fn => fn()))

  function onCountdownDone() {
    screen = 'playing'
  }
</script>

<BeamerView {screen} payload={currentPayload} {assignedPlayerIds} onCountdownDone={onCountdownDone} />

