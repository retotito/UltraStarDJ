<script lang="ts">
  import { onMount } from 'svelte'
  import { appSettings } from '$lib/stores/settings.svelte'
  import { songLibrary } from '$lib/stores/songs.svelte'
  import AppShell from '$components/AppShell.svelte'

  onMount(async () => {
    appSettings.load()
    await songLibrary.scanSources(appSettings.sources)
  })
</script>

<AppShell />
