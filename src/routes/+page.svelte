<script lang="ts">
  import { onMount } from 'svelte'
  import { appSettings } from '$lib/stores/settings.svelte'
  import AppShell from '$components/AppShell.svelte'

  onMount(() => {
    appSettings.load()
  })
</script>

<AppShell />
