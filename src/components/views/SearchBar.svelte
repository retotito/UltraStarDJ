<script lang="ts">
  import Select from '$components/ui/Select.svelte'
  import type { SongSource } from '$lib/stores/settings.svelte'

  let {
    query = $bindable(''),
    languages = [] as string[],
    genres = [] as string[],
    sources = [] as SongSource[],
    sourceOptions = [] as { value: string; label: string }[],
    selectedLanguage = $bindable(''),
    selectedGenre = $bindable(''),
    selectedSource = $bindable(''),
    selectedQuality = $bindable(''),
  }: {
    query?: string
    languages?: string[]
    genres?: string[]
    sources?: SongSource[]
    sourceOptions?: { value: string; label: string }[]
    selectedLanguage?: string
    selectedGenre?: string
    selectedSource?: string
    selectedQuality?: string
  } = $props()

  const qualityOptions = [
    { value: '',    label: 'Rating' },
    { value: '100', label: '★ Popular (100+)' },
    { value: '500', label: '★★ Good (500+)' },
    { value: '1000', label: '★★★ Very good (1000+)' },
    { value: '2000', label: '★★★★ Top (2000+)' },
  ]
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
    <Select
      class="filter-select"
      value={selectedLanguage}
      options={[{ value: '', label: 'Language' }, ...languages.map(l => ({ value: l, label: l }))]}
      onchange={(v) => selectedLanguage = v}
    />

    <Select
      class="filter-select"
      value={selectedGenre}
      options={[{ value: '', label: 'Genre' }, ...genres.map(g => ({ value: g, label: g }))]}
      onchange={(v) => selectedGenre = v}
    />

    <Select
      class="filter-select"
      value={selectedQuality}
      options={qualityOptions}
      onchange={(v) => selectedQuality = v}
    />

    {#if sources.length >= 2}
      <Select
        class="filter-select"
        value={selectedSource}
        options={sourceOptions}
        onchange={(v) => selectedSource = v}
      />
    {/if}

    {#if selectedLanguage || selectedGenre || selectedQuality}
      <button class="btn btn-text" onclick={() => { selectedLanguage = ''; selectedGenre = ''; selectedQuality = '' }}>
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
