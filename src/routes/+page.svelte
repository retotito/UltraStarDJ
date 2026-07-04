<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { appSettings } from '$lib/stores/settings.svelte'
  import { songLibrary } from '$lib/stores/songs.svelte'
  import AppShell from '$components/AppShell.svelte'
  import GameAudio from '$components/game/GameAudio.svelte'
  import GameYouTube from '$components/game/GameYouTube.svelte'
  import VideoPreloader from '$components/game/VideoPreloader.svelte'
  import Modal from '$components/ui/Modal.svelte'
  import SongValidationDialog from '$components/dialogs/SongValidationDialog.svelte'
  import { errorStore } from '$lib/stores/error.svelte'

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
<GameYouTube />
<VideoPreloader />
<AppShell />

<Modal open={errorStore.open} title={errorStore.title} onclose={() => errorStore.dismiss()}>
  <SongValidationDialog
    errors={errorStore.messages.map(m => ({ field: '', message: m }))}
    onclose={() => errorStore.dismiss()}
  />
</Modal>
