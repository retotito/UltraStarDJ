<script lang="ts">
  import { layout } from '$lib/stores/layout.svelte'
  import { openBeamerWindow } from '$lib/ipc/tauri'
  import Modal from '$components/ui/Modal.svelte'
  import SettingsDialog from '$components/dialogs/SettingsDialog.svelte'

  let showSettings = $state(false)
  let showLayoutMenu = $state(false)

  async function handleBeamer() {
    await openBeamerWindow()
  }
</script>

<aside class="sidebar">
  <nav class="sidebar-nav">
    <button class="btn btn-icon is-active" data-tooltip="Library" aria-label="Library">
      <span class="icon">library_music</span>
    </button>

    <button
      class="btn btn-icon"
      class:is-active={showLayoutMenu}
      data-tooltip="Layout"
      aria-label="Toggle layout options"
      onclick={() => showLayoutMenu = !showLayoutMenu}
    >
      <span class="icon">dashboard</span>
    </button>
  </nav>

  <div class="sidebar-bottom">
    <button
      class="btn btn-icon"
      data-tooltip="Settings"
      aria-label="Settings"
      onclick={() => showSettings = true}
    >
      <span class="icon">settings</span>
    </button>

    <button
      class="btn btn-icon"
      data-tooltip="Open Beamer"
      aria-label="Open Beamer window"
      onclick={handleBeamer}
    >
      <span class="icon">cast</span>
    </button>
  </div>
</aside>

{#if showLayoutMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="layout-popover" onmouseleave={() => showLayoutMenu = false}>
    <p class="popover-label">Panels</p>

    <label class="toggle-row">
      <span>Player</span>
      <label class="switch">
        <input type="checkbox" checked={layout.showPlayer} onchange={() => layout.togglePlayer()} />
        <span class="switch-track"><span class="switch-thumb"></span></span>
      </label>
    </label>

    <label class="toggle-row">
      <span>Queue</span>
      <label class="switch">
        <input type="checkbox" checked={layout.showQueue} onchange={() => layout.toggleQueue()} />
        <span class="switch-track"><span class="switch-thumb"></span></span>
      </label>
    </label>

    <p class="popover-label" style="margin-top: var(--space-3)">Columns</p>
    {#each layout.columns.filter(c => c.key !== 'index') as col (col.key)}
      <label class="toggle-row">
        <span>{col.label}</span>
        <label class="switch">
          <input type="checkbox" checked={col.visible} onchange={() => layout.toggleColumn(col.key)} />
          <span class="switch-track"><span class="switch-thumb"></span></span>
        </label>
      </label>
    {/each}
  </div>
{/if}

<Modal open={showSettings} title="Settings" onclose={() => showSettings = false}>
  <SettingsDialog />
</Modal>

<style>
  .sidebar {
    width: 56px;
    flex-shrink: 0;
    background: var(--md-sys-color-surface-container-low);
    border-right: 1px solid var(--md-sys-color-outline-variant);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) 0;
    z-index: var(--z-overlay);
  }

  .sidebar-nav,
  .sidebar-bottom {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  /* CSS tooltip */
  .btn-icon[data-tooltip] { position: relative; }
  .btn-icon[data-tooltip]::after {
    content: attr(data-tooltip);
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    background: var(--md-sys-color-surface-container-highest);
    color: var(--md-sys-color-on-surface);
    font-size: var(--text-xs);
    white-space: nowrap;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--transition-fast);
    z-index: var(--z-toast);
    box-shadow: var(--elevation-1);
  }
  .btn-icon[data-tooltip]:hover::after { opacity: 1; }

  .layout-popover {
    position: fixed;
    left: 64px;
    top: 60px;
    background: var(--md-sys-color-surface-container-high);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    min-width: 200px;
    z-index: var(--z-overlay);
    box-shadow: var(--elevation-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .popover-label {
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--md-sys-color-on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: var(--space-1);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface);
    padding: var(--space-1) 0;
    cursor: pointer;
  }
</style>
