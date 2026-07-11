<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { onPlaySong, onPreviewSong, onStopSong, onPauseSong, onResumeSong, onScreenConfig, onTimeTick, getWindowLabel, sendCountdownDone, onBeamerSettings, onPitchTick } from '$lib/ipc/tauri'
  import { layout } from '$lib/stores/layout.svelte'
  import type { UnlistenFn } from '@tauri-apps/api/event'
  import type { PlaySongPayload, PreviewSongPayload } from '$lib/ultrastar/types'
  import type { PitchTickEntry } from '$lib/ipc/tauri'
  import BeamerView from '$components/game/BeamerView.svelte'

  export type BeamerScreen = 'idle' | 'preview' | 'countdown' | 'playing' | 'paused' | 'score'

  let screen = $state<BeamerScreen>('idle')
  let currentPayload = $state<PlaySongPayload | PreviewSongPayload | null>(null)
  let assignedPlayerIds = $state<number[]>([])
  let currentTime = $state(0)
  let smoothTime  = $state(0)
  let _lastKnownTime = 0
  let _lastKnownAt   = 0
  let _rafId = 0

  function rafLoop() {
    if (screen === 'playing') {
      const elapsed = (performance.now() - _lastKnownAt) / 1000
      smoothTime = _lastKnownTime + elapsed
    } else {
      smoothTime = currentTime  // paused/stopped: use exact value
    }
    _rafId = requestAnimationFrame(rafLoop)
  }
  let unlisteners: UnlistenFn[] = []

  // Beamer display settings — initialised from localStorage, then kept in sync via IPC
  let showPianoRollLines = $state(layout.showPianoRollLines)
  let showNoteSyllables  = $state(layout.showNoteSyllables)
  let noteBarStyle       = $state<'white' | 'black'>(layout.noteBarStyle)
  let pitchTicks         = $state<PitchTickEntry[]>([])

  const windowLabel = getWindowLabel()

  onMount(async () => {
    _rafId = requestAnimationFrame(rafLoop)
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
      onTimeTick(t => {
        currentTime = t
        _lastKnownTime = t
        _lastKnownAt   = performance.now()
      }),
      onBeamerSettings(s => {
        showPianoRollLines = s.showPianoRollLines
        showNoteSyllables  = s.showNoteSyllables
        noteBarStyle       = s.noteBarStyle
      }),
      onPitchTick(p => { pitchTicks = p.ticks }),
    ])
  })

  onDestroy(() => {
    cancelAnimationFrame(_rafId)
    unlisteners.forEach(fn => fn())
  })

  function onCountdownDone() {
    screen = 'playing'
    sendCountdownDone()
  }
</script>

<BeamerView {screen} payload={currentPayload} {assignedPlayerIds} {currentTime} {smoothTime} onCountdownDone={onCountdownDone} {showPianoRollLines} {showNoteSyllables} {noteBarStyle} {pitchTicks} />

