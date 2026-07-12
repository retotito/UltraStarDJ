<script lang="ts">
  import { appSettings, type SongSource } from '$lib/stores/settings.svelte'
  import { songLibrary } from '$lib/stores/songs.svelte'
  import { usdbStore } from '$lib/stores/usdb.svelte'
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

  // ── USDB section ──────────────────────────────────────────────────────────
  let usdbUsername = $state(usdbStore.username)
  let usdbPassword = $state(usdbStore.password)
  let usdbLoginError = $state<string | null>(null)

  async function connectUsdb() {
    usdbLoginError = null
    usdbStore.setCredentials(usdbUsername, usdbPassword)
    const result = await usdbStore.login()
    if (!result.ok) {
      usdbLoginError = result.error ?? 'Login failed'
      return
    }
    // After login, sync in background then update library
    await usdbStore.syncCatalog(false)
    syncUsdbToLibrary()
  }

  function disconnectUsdb() {
    usdbStore.clearCredentials()
    syncUsdbToLibrary()
  }

  async function resyncUsdb(force = false) {
    await usdbStore.syncCatalog(force)
    syncUsdbToLibrary()
  }

  function syncUsdbToLibrary() {
    songLibrary.setUsdbSongs(usdbStore.catalog)
  }

  // Sync catalog to library on component mount (in case catalog was loaded from localStorage)
  syncUsdbToLibrary()
</script>

<div class="sources-panel">
  <div class="section-header">
    {#if songLibrary.scanStatus === 'error'}
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
        <li class="source-row" class:unavailable={source.available === false}>
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

          {#if songLibrary.scanningSourceId === source.id}
            <span class="icon icon-sm spinning">sync</span>
          {:else if source.available === false}
            <span class="icon icon-sm unavailable-icon" title="Source not found">wifi_off</span>
          {:else}
            {@const count = songLibrary.countBySource[source.id] ?? source.lastCount}
            {#if count !== undefined}
              <span class="song-count text-xs">{count}</span>
            {/if}
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

  <div class="actions-row">
    <button class="btn btn-tonal add-btn" onclick={addFolder}>
      <span class="icon icon-sm">create_new_folder</span>
      Add folder
    </button>
    <button
      class="btn btn-outlined add-btn"
      onclick={() => songLibrary.scanSources(appSettings.sources)}
      disabled={songLibrary.scanning}
    >
      <span class="icon icon-sm">refresh</span>
      Rescan
    </button>
  </div>

  <!-- USDB section -->
  <div class="usdb-section">
    <div class="usdb-header">
      <span class="usdb-badge">USDB</span>
      <span class="section-title">usdb.animux.de</span>
      {#if usdbStore.loggedIn}
        <span class="usdb-status connected">
          <span class="icon icon-sm">check_circle</span>
          Connected
        </span>
      {/if}
    </div>

    {#if !usdbStore.loggedIn}
      <div class="usdb-login-form">
        <input
          class="input input-sm"
          type="text"
          placeholder="Username"
          bind:value={usdbUsername}
        />
        <input
          class="input input-sm"
          type="password"
          placeholder="Password"
          bind:value={usdbPassword}
        />
        {#if usdbLoginError}
          <span class="usdb-error text-xs">{usdbLoginError}</span>
        {/if}
        <button class="btn btn-primary btn-sm" onclick={connectUsdb}>
          <span class="icon icon-sm">login</span>
          Connect
        </button>
      </div>
    {:else}
      <div class="usdb-connected">
        <span class="text-xs text-muted">{usdbStore.catalogCount.toLocaleString()} songs</span>
        {#if usdbStore.syncStatus === 'syncing'}
          <div class="usdb-sync-progress">
            <div class="sync-bar-track">
              {#if usdbStore.syncProgressPct >= 0}
                <div class="sync-bar-fill" style="width: {usdbStore.syncProgressPct}%"></div>
              {:else}
                <div class="sync-bar-fill sync-bar-indeterminate"></div>
              {/if}
            </div>
            <span class="text-xs text-muted">
              {usdbStore.syncIsFullSync ? `Syncing… ${usdbStore.syncFetched > 0 ? `${usdbStore.syncFetched.toLocaleString()} / ~27,000` : ''}` : 'Syncing new songs…'}
            </span>
          </div>
        {:else if usdbStore.syncError}
          <span class="text-xs usdb-error">{usdbStore.syncError}</span>
        {/if}
        <div class="usdb-actions">
          <button class="btn btn-sm btn-tonal" onclick={() => resyncUsdb(false)} disabled={usdbStore.syncStatus === 'syncing'}>
            <span class="icon icon-sm">sync</span>
            Sync new
          </button>
          <button class="btn btn-sm btn-outlined" onclick={() => resyncUsdb(true)} disabled={usdbStore.syncStatus === 'syncing'}>
            <span class="icon icon-sm">refresh</span>
            Full resync
          </button>
          <button class="btn btn-sm btn-outlined" onclick={disconnectUsdb}>
            <span class="icon icon-sm">logout</span>
            Disconnect
          </button>
        </div>
      </div>
    {/if}
  </div>
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

  .source-row.unavailable {
    opacity: 0.5;
  }

  .unavailable-icon {
    color: var(--md-sys-color-error);
    flex-shrink: 0;
  }

  .add-btn {
    gap: var(--space-2);
  }

  .actions-row {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  /* ── USDB section ── */
  .usdb-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    border-top: 1px solid var(--md-sys-color-outline-variant);
    padding-top: var(--space-3);
  }

  .usdb-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .usdb-badge {
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    background: #22c55e;
    color: #fff;
    border-radius: 4px;
    padding: 1px 5px;
    flex-shrink: 0;
  }

  .usdb-status.connected {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-xs);
    color: #22c55e;
    margin-left: auto;
  }

  .usdb-login-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .usdb-connected {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .usdb-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .usdb-error {
    color: var(--md-sys-color-error);
  }

  .usdb-sync-progress {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .sync-bar-track {
    height: 6px;
    background: var(--md-sys-color-surface-variant);
    border-radius: 3px;
    overflow: hidden;
  }

  .sync-bar-fill {
    height: 100%;
    background: #22c55e;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  @keyframes indeterminate {
    0%   { transform: translateX(-100%) scaleX(0.5); }
    50%  { transform: translateX(0%)    scaleX(0.5); }
    100% { transform: translateX(200%)  scaleX(0.5); }
  }

  .sync-bar-indeterminate {
    width: 50%;
    animation: indeterminate 1.5s ease-in-out infinite;
  }
</style>
