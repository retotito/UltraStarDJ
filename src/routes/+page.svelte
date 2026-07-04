<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { appSettings } from '$lib/stores/settings.svelte'
  import { songLibrary } from '$lib/stores/songs.svelte'
  import AppShell from '$components/AppShell.svelte'
  import GameAudio from '$components/game/GameAudio.svelte'

  let stopWatcher: (() => void) | null = null

  onMount(async () => {
    appSettings.load()
    await songLibrary.scanSources(appSettings.sources)
    stopWatcher = songLibrary.startAvailabilityWatcher(() => appSettings.sources)
  })

  onDestroy(() => {
    stopWatcher?.()
  })
</script>

<GameAudio />
<AppShell />
