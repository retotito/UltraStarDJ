<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { onPlaySong, onStopSong, onPauseSong, onResumeSong } from '$lib/ipc/tauri'
  import type { UnlistenFn } from '@tauri-apps/api/event'
  import type { PlaySongPayload } from '$lib/ultrastar/types'
  import BeamerView from '$components/game/BeamerView.svelte'

  let currentPayload = $state<PlaySongPayload | null>(null)
  let unlisteners: UnlistenFn[] = []

  onMount(async () => {
    unlisteners = await Promise.all([
      onPlaySong(payload => { currentPayload = payload }),
      onStopSong(() => { currentPayload = null }),
      onPauseSong(() => {}),
      onResumeSong(() => {})
    ])
  })

  onDestroy(() => {
    unlisteners.forEach(fn => fn())
  })
</script>

<BeamerView payload={currentPayload} />
