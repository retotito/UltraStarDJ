<script lang="ts">
  import { songLibrary } from '$lib/stores/songs.svelte'
  import { appSettings } from '$lib/stores/settings.svelte'
  import SearchBar from '$components/views/SearchBar.svelte'
  import SongTable from '$components/views/SongTable.svelte'

  let query = $state('')
  let selectedLanguage = $state('')
  let selectedGenre = $state('')
  let selectedSource = $state('')

  const songs = $derived(songLibrary.songs)

  const sources = $derived(
    appSettings.sources.filter(s => s.enabled && s.type === 'local-folder')
  )
  const languages = $derived([...new Set(songs.map(s => s.language).filter(Boolean))] as string[])
  const genres = $derived([...new Set(songs.map(s => s.genre).filter(Boolean))] as string[])

  const filtered = $derived(
    songs.filter(s => {
      const q = query.toLowerCase()
      const matchesSearch = !q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
      const matchesLang = !selectedLanguage || s.language === selectedLanguage
      const matchesGenre = !selectedGenre || s.genre === selectedGenre
      const matchesSource = !selectedSource || s.sourceId === selectedSource
      return matchesSearch && matchesLang && matchesGenre && matchesSource
    })
  )
</script>

<div class="library-panel">
  <SearchBar
    bind:query
    bind:selectedLanguage
    bind:selectedGenre
    bind:selectedSource
    {languages}
    {genres}
    {sources}
  />
  <div class="table-container">
    <SongTable songs={filtered} />
  </div>
  <footer class="status-bar">
    <span class="text-muted text-xs">{filtered.length} of {songs.length} songs</span>
    {#if songLibrary.scanning}
      <span class="text-muted text-xs">
        <span class="icon icon-sm" style="vertical-align: middle">sync</span>
        Scanning…
      </span>
    {/if}
  </footer>
</div>
  <div class="table-container">
    <SongTable songs={filtered} />
  </div>
  <footer class="status-bar">
    <span class="text-muted text-xs">{filtered.length} songs</span>
  </footer>
</div>

<style>
  .library-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .table-container {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .status-bar {
    padding: var(--space-1) var(--space-4);
    border-top: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    flex-shrink: 0;
  }
</style>
