<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { onPlaySong, onStopSong, onPauseSong, onResumeSong, onScreenConfig, getWindowLabel } from '$lib/ipc/tauri'
  import type { UnlistenFn } from '@tauri-apps/api/event'
  import type { PlaySongPayload } from '$lib/ultrastar/types'
  import BeamerView from '$components/game/BeamerView.svelte'

  let currentPayload = $state<PlaySongPayload | null>(null)
  let assignedPlayerIds = $state<number[]>([])
  let unlisteners: UnlistenFn[] = []

  const windowLabel = getWindowLabel()

  onMount(async () => {
    unlisteners = await Promise.all([
      onPlaySong(payload => { currentPayload = payload }),
      onStopSong(() => { currentPayload = null }),
      onPauseSong(() => {}),
      onResumeSong(() => {}),
      onScreenConfig(cfg => {
        if (cfg.windowLabel === windowLabel) {
          assignedPlayerIds = cfg.playerIds
        }
      }),
    ])
  })

  onDestroy(() => {
    unlisteners.forEach(fn => fn())
  })
</script>

<BeamerView payload={currentPayload} {assignedPlayerIds} />
