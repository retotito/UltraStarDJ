<script lang="ts">
  import '@material/web/textfield/outlined-text-field.js'
  import '@material/web/select/outlined-select.js'
  import '@material/web/select/select-option.js'
  import '@material/web/icon/icon.js'
  import '@material/web/button/text-button.js'

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
  <div class="search-field-wrap">
    <md-outlined-text-field
      class="search-field"
      label="Search songs"
      value={query}
      oninput={(e: Event) => { query = (e.target as HTMLInputElement & { value: string }).value }}
      type="search"
    >
      <md-icon slot="leading-icon">search</md-icon>
    </md-outlined-text-field>
  </div>

  <div class="filter-row">
    <md-outlined-select
      class="filter-select"
      label="Language"
      value={selectedLanguage}
      onchange={(e: Event) => { selectedLanguage = (e.target as HTMLElement & { value: string }).value }}
    >
      <md-select-option value="">All</md-select-option>
      {#each languages as lang}
        <md-select-option value={lang}>{lang}</md-select-option>
      {/each}
    </md-outlined-select>

    <md-outlined-select
      class="filter-select"
      label="Genre"
      value={selectedGenre}
      onchange={(e: Event) => { selectedGenre = (e.target as HTMLElement & { value: string }).value }}
    >
      <md-select-option value="">All</md-select-option>
      {#each genres as genre}
        <md-select-option value={genre}>{genre}</md-select-option>
      {/each}
    </md-outlined-select>

    {#if selectedLanguage || selectedGenre}
      <md-text-button onclick={() => { selectedLanguage = ''; selectedGenre = '' }}>
        <md-icon slot="icon">filter_list_off</md-icon>
        Clear filters
      </md-text-button>
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
    /* Shrink MD3 text fields to fit the toolbar */
    --md-outlined-text-field-container-shape: var(--radius-full);
    --md-outlined-select-text-field-container-shape: var(--radius-full);
  }

  .search-field-wrap {
    flex: 0 0 200px;
  }

  .search-field-wrap :global(md-outlined-text-field) {
    width: 100%;
  }

  .filter-row {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .filter-row :global(md-outlined-select) {
    flex: 1;
    min-width: 0;
  }
</style>
