<script lang="ts">
  import '@material/web/iconbutton/icon-button.js'
  import '@material/web/icon/icon.js'
  import '@material/web/switch/switch.js'
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
    <!-- Library (always active) -->
    <md-icon-button
      toggle
      selected={true}
      aria-label="Library"
      data-tooltip="Library"
    >
      <md-icon>library_music</md-icon>
    </md-icon-button>

    <!-- Layout toggle -->
    <md-icon-button
      toggle
      selected={showLayoutMenu}
      aria-label="Toggle layout options"
      data-tooltip="Layout"
      onclick={() => showLayoutMenu = !showLayoutMenu}
    >
      <md-icon>dashboard</md-icon>
    </md-icon-button>
  </nav>

  <div class="sidebar-bottom">
    <!-- Settings -->
    <md-icon-button
      aria-label="Settings"
      data-tooltip="Settings"
      onclick={() => showSettings = true}
    >
      <md-icon>settings</md-icon>
    </md-icon-button>

    <!-- Open Beamer -->
    <md-icon-button
      aria-label="Open Beamer window"
      data-tooltip="Open Beamer"
      onclick={handleBeamer}
    >
      <md-icon>cast</md-icon>
    </md-icon-button>
  </div>
</aside>

<!-- Layout popover — anchored to sidebar -->
{#if showLayoutMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="layout-popover"
    onmouseleave={() => showLayoutMenu = false}
  >
    <p class="popover-label">Panels</p>
    <label class="toggle-row">
      Player
      <md-switch
        selected={layout.showPlayer}
        onchange={() => layout.togglePlayer()}
        aria-label="Toggle player panel"
      ></md-switch>
    </label>
    <label class="toggle-row">
      Queue
      <md-switch
        selected={layout.showQueue}
        onchange={() => layout.toggleQueue()}
        aria-label="Toggle queue panel"
      ></md-switch>
    </label>

    <p class="popover-label" style="margin-top: var(--space-3)">Columns</p>
    {#each layout.columns.filter(c => c.key !== 'index') as col (col.key)}
      <label class="toggle-row">
        {col.label}
        <md-switch
          selected={col.visible}
          onchange={() => layout.toggleColumn(col.key)}
          aria-label={`Toggle ${col.label} column`}
        ></md-switch>
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
    /* MD3 icon button token overrides for all buttons in this sidebar */
    --md-icon-button-icon-color: var(--md-sys-color-on-surface-variant);
    --md-icon-button-hover-icon-color: var(--md-sys-color-on-surface);
    --md-icon-button-hover-state-layer-color: var(--md-sys-color-on-surface);
    --md-icon-button-selected-icon-color: var(--md-sys-color-primary);
    --md-icon-button-toggle-selected-focus-icon-color: var(--md-sys-color-primary);
    --md-icon-button-toggle-selected-hover-icon-color: var(--md-sys-color-primary);
    --md-icon-button-toggle-selected-pressed-icon-color: var(--md-sys-color-primary);
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  .sidebar-bottom {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  /* CSS tooltip on md-icon-button host element */
  :global(md-icon-button[data-tooltip]) {
    position: relative;
  }
  :global(md-icon-button[data-tooltip]::after) {
    content: attr(data-tooltip);
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    background: var(--md-sys-color-surface-container-highest);
    color: var(--md-sys-color-on-surface);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    white-space: nowrap;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--transition-fast);
    z-index: var(--z-toast);
    box-shadow: var(--elevation-1);
  }
  :global(md-icon-button[data-tooltip]:hover::after) {
    opacity: 1;
  }

  /* Layout popover */
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
    cursor: pointer;
    padding: var(--space-1) 0;
  }
</style>
