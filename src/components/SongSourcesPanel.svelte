<script lang="ts">
  import { appSettings, type SongSource } from '$lib/stores/settings.svelte'
  import { songLibrary } from '$lib/stores/songs.svelte'
  import { pickFolder } from '$lib/ipc/tauri'

  async function addFolder() {
    const path = await pickFolder()
    if (!path) return
    const label = path.split('/').filter(Boolean).pop() ?? path
    const source: SongSource = {
      id: crypto.randomUUID(),
      type: 'local-folder',
      label,
      path,
      enabled: true
    }
    appSettings.addSource(source)
    appSettings.save()
    await songLibrary.scanSources(appSettings.sources)
  }

  async function toggleSource(id: string) {
    appSettings.toggleSource(id)
    appSettings.save()
    await songLibrary.scanSources(appSettings.sources)
  }

  function removeSource(id: string) {
    appSettings.removeSource(id)
    appSettings.save()
    songLibrary.removeBySouceId(id)
  }

  // Inline rename state
  let editingId = $state<string | null>(null)
  let editingLabel = $state('')

  function startRename(source: SongSource) {
    editingId = source.id
    editingLabel = source.label
  }

  function commitRename(id: string) {
    const trimmed = editingLabel.trim()
    if (trimmed) {
      appSettings.renameSource(id, trimmed)
      appSettings.save()
    }
    editingId = null
  }

  function onRenameKeydown(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter') commitRename(id)
    if (e.key === 'Escape') editingId = null
  }
</script>

<div class="sources-panel">
  <div class="section-header">
    <span class="section-title">Song Sources</span>
    {#if songLibrary.scanning}
      <span class="scan-status">
        <span class="icon icon-sm spinning">sync</span>
        Scanning…
      </span>
    {:else if songLibrary.scanStatus === 'error'}
      <span class="scan-status error">
        <span class="icon icon-sm">error</span>
        {songLibrary.scanError}
      </span>
    {/if}
  </div>

  {#if appSettings.sources.length === 0}
    <p class="empty-hint">No sources added yet.</p>
  {:else}
    <ul class="source-list">
      {#each appSettings.sources as source (source.id)}
        <li class="source-row">
          <label class="toggle-switch" title={source.enabled ? 'Enabled' : 'Disabled'}>
            <input
              type="checkbox"
              checked={source.enabled}
              onchange={() => toggleSource(source.id)}
            />
            <span class="toggle-slider"></span>
          </label>

          <div class="source-info">
            {#if editingId === source.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="input rename-input"
                autofocus
                bind:value={editingLabel}
                onblur={() => commitRename(source.id)}
                onkeydown={(e) => onRenameKeydown(e, source.id)}
              />
            {:else}
              <button class="source-name-btn" ondblclick={() => startRename(source)} title="Double-click to rename">
                <span class="source-name text-sm">{source.label}</span>
              </button>
            {/if}
            <span class="source-path text-xs">{source.path ?? source.type}</span>
          </div>

          {#if songLibrary.countBySource[source.id] !== undefined}
            <span class="song-count text-xs">{songLibrary.countBySource[source.id]}</span>
          {/if}

          <button
            class="btn btn-icon-sm"
            onclick={() => removeSource(source.id)}
            aria-label="Remove {source.label}"
          >
            <span class="icon icon-sm">delete</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <button class="btn btn-tonal add-btn" onclick={addFolder}>
    <span class="icon icon-sm">create_new_folder</span>
    Add folder
  </button>
</div>

<style>
  .sources-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .section-title {
    flex: 1;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--md-sys-color-on-surface);
  }

  .scan-status {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
  }
  .scan-status.error { color: var(--md-sys-color-error); }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .spinning { animation: spin 1s linear infinite; display: inline-block; }

  .empty-hint {
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface-variant);
  }

  .source-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .source-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: var(--md-sys-color-surface-container);
    border-radius: var(--radius-md);
  }

  .source-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .source-name-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: text;
    text-align: left;
    width: 100%;
  }

  .source-name {
    display: block;
    font-weight: var(--font-weight-medium);
    color: var(--md-sys-color-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-path {
    color: var(--md-sys-color-on-surface-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rename-input {
    height: 28px;
    width: 100%;
    font-size: var(--text-sm);
  }

  .song-count {
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .add-btn {
    align-self: flex-start;
    gap: var(--space-2);
  }
</style>
