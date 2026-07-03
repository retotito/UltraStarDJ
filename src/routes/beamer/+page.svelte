<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { onPlaySong, onStopSong, onPauseSong, onResumeSong, onScreenConfig, getWindowLabel } from '$lib/ipc/tauri'
  import type { UnlistenFn } from '@tauri-apps/api/event'
  import type { PlaySongPayload } from '$lib/ultrastar/types'
  import BeamerView from '$components/game/BeamerView.svelte'

  const ts = () => new Date().toISOString().slice(11, 23)
  let currentPayload = $state<PlaySongPayload | null>(null)
  let assignedPlayerIds = $state<number[]>([])
  let unlisteners: UnlistenFn[] = []

  const windowLabel = getWindowLabel()
  console.log(`[${ts()}] [${windowLabel}] window loaded`)

  onMount(async () => {
    unlisteners = await Promise.all([
      onPlaySong(payload => {
        console.log(`[${ts()}] [${windowLabel}] ← play-song: ${payload.song.artist} - ${payload.song.title}`)
        currentPayload = payload
      }),
      onStopSong(() => {
        console.log(`[${ts()}] [${windowLabel}] ← stop-song`)
        currentPayload = null
      }),
      onPauseSong(() => console.log(`[${ts()}] [${windowLabel}] ← pause-song`)),
      onResumeSong(() => console.log(`[${ts()}] [${windowLabel}] ← resume-song`)),
      onScreenConfig(cfg => {
        console.log(`[${ts()}] [${windowLabel}] ← screen-config: windowLabel=${cfg.windowLabel} playerIds=${JSON.stringify(cfg.playerIds)} (mine=${cfg.windowLabel === windowLabel})`)
        if (cfg.windowLabel === windowLabel) {
          assignedPlayerIds = cfg.playerIds
        }
      }),
    ])
    console.log(`[${ts()}] [${windowLabel}] listeners registered`)
  })

  onDestroy(() => {
    unlisteners.forEach(fn => fn())
  })
</script>

<BeamerView payload={currentPayload} {assignedPlayerIds} />
