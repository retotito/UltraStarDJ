<script lang="ts">
  import { mockSongs } from '$lib/db/mockSongs'
  import SearchBar from '$components/views/SearchBar.svelte'
  import SongTable from '$components/views/SongTable.svelte'

  let query = $state('')
  let selectedLanguage = $state('')
  let selectedGenre = $state('')

  const languages = $derived([...new Set(mockSongs.map(s => s.language).filter(Boolean))] as string[])
  const genres = $derived([...new Set(mockSongs.map(s => s.genre).filter(Boolean))] as string[])

  const filtered = $derived(
    mockSongs.filter(s => {
      const q = query.toLowerCase()
      const matchesSearch = !q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
      const matchesLang = !selectedLanguage || s.language === selectedLanguage
      const matchesGenre = !selectedGenre || s.genre === selectedGenre
      return matchesSearch && matchesLang && matchesGenre
    })
  )
</script>

<div class="library-panel">
  <SearchBar
    bind:query
    bind:selectedLanguage
    bind:selectedGenre
    {languages}
    {genres}
  />
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
