<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { onPlaySong, onPreviewSong, onStopSong, onPauseSong, onResumeSong, onScreenConfig, onTimeTick, getWindowLabel, sendCountdownDone, onBeamerSettings } from '$lib/ipc/tauri'
  import type { UnlistenFn } from '@tauri-apps/api/event'
  import type { PlaySongPayload, PreviewSongPayload } from '$lib/ultrastar/types'
  import BeamerView from '$components/game/BeamerView.svelte'

  export type BeamerScreen = 'idle' | 'preview' | 'countdown' | 'playing' | 'paused' | 'score'

  let screen = $state<BeamerScreen>('idle')
  let currentPayload = $state<PlaySongPayload | PreviewSongPayload | null>(null)
  let assignedPlayerIds = $state<number[]>([])
  let currentTime = $state(0)
  let unlisteners: UnlistenFn[] = []

  // Beamer display settings (synced from DJ window via IPC)
  let showPianoRollLines = $state(true)
  let showNoteSyllables  = $state(true)
  let noteBarStyle       = $state<'white' | 'black'>('white')

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
        } else if (screen === 'preview' || screen === 'score') {
          screen = 'idle'
          currentPayload = null
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
      onBeamerSettings(s => {
        showPianoRollLines = s.showPianoRollLines
        showNoteSyllables  = s.showNoteSyllables
        noteBarStyle       = s.noteBarStyle
      }),
    ])
  })

  onDestroy(() => unlisteners.forEach(fn => fn()))

  function onCountdownDone() {
    screen = 'playing'
    sendCountdownDone()
  }
</script>

<BeamerView {screen} payload={currentPayload} {assignedPlayerIds} {currentTime} onCountdownDone={onCountdownDone} {showPianoRollLines} {showNoteSyllables} {noteBarStyle} />

