<script lang="ts">
  let {
    query = $bindable(''),
    languages = [] as string[],
    genres = [] as string[],
    selectedLanguage = $bindable(''),
    selectedGenre = $bindable('')
  }: {
    query?: string
    languages?: string[]
    genres?: string[]
    selectedLanguage?: string
    selectedGenre?: string
  } = $props()
</script>

<div class="search-bar">
  <div class="input-wrap search-wrap">
    <span class="icon input-icon icon-sm">search</span>
    <input
      class="input"
      type="text"
      placeholder="Search songs…"
      bind:value={query}
    />
    {#if query}
      <button class="btn btn-icon-sm input-clear" onclick={() => query = ''} aria-label="Clear search">
        <span class="icon icon-sm">close</span>
      </button>
    {/if}
  </div>

  <div class="filter-row">
    <select class="select filter-select" bind:value={selectedLanguage} aria-label="Filter by language">
      <option value="">Language</option>
      {#each languages as lang}
        <option value={lang}>{lang}</option>
      {/each}
    </select>

    <select class="select filter-select" bind:value={selectedGenre} aria-label="Filter by genre">
      <option value="">Genre</option>
      {#each genres as genre}
        <option value={genre}>{genre}</option>
      {/each}
    </select>

    {#if selectedLanguage || selectedGenre}
      <button class="btn btn-text" onclick={() => { selectedLanguage = ''; selectedGenre = '' }}>
        <span class="icon icon-sm">filter_list_off</span>
        Clear
      </button>
    {/if}
  </div>
</div>

<style>
  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }

  .search-wrap {
    flex: 0 0 220px;
  }

  .filter-row {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .filter-select {
    flex: 1;
    min-width: 0;
  }
</style>
