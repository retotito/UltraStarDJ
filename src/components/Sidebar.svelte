<script lang="ts">
  import { layout } from '$lib/stores/layout.svelte'
  import { playback } from '$lib/stores/playback.svelte'
  import Modal from '$components/ui/Modal.svelte'
  import SettingsDialog from '$components/dialogs/SettingsDialog.svelte'
  import PlayersView from '$components/views/PlayersView.svelte'
  import DisplaysView from '$components/views/DisplaysView.svelte'

  let showSettings = $state(false)
  let showLayoutMenu = $state(false)
  let showPlayers = $state(false)
  let showDisplays = $state(false)
</script>

<aside class="sidebar">
  <nav class="sidebar-nav">
    <button class="btn btn-icon is-active" data-tooltip="Library" aria-label="Library">
      <span class="icon">library_music</span>
    </button>

    <button
      class="btn btn-icon now-playing-btn"
      class:is-active={layout.showNowPlaying && playback.isLoaded}
      data-tooltip="Now Playing"
      aria-label="Toggle now playing"
      onclick={() => layout.toggleNowPlaying()}
    >
      <span class="icon">play_circle</span>
      {#if playback.isLoaded && !layout.showNowPlaying}
        <span class="np-dot"></span>
      {/if}
    </button>

    <button
      class="btn btn-icon"
      class:is-active={showLayoutMenu}
      data-tooltip="Layout"
      aria-label="Toggle layout options"
      onclick={() => { showLayoutMenu = !showLayoutMenu; showPlayers = false; showDisplays = false }}
    >
      <span class="icon">dashboard</span>
    </button>

    <button
      class="btn btn-icon"
      class:is-active={showPlayers}
      data-tooltip="Players"
      aria-label="Player & mic settings"
      onclick={() => { showPlayers = !showPlayers; showLayoutMenu = false; showDisplays = false }}
    >
      <span class="icon">group</span>
    </button>

    <!-- Queue toggle (hidden for now — accessible via Layout panel)
    <button
      class="btn btn-icon"
      class:is-active={layout.showQueue}
      data-tooltip="Queue"
      aria-label="Toggle queue"
      onclick={() => layout.toggleQueue()}
    >
      <span class="icon">queue_music</span>
    </button>
    -->

    <button
      class="btn btn-icon"
      class:is-active={showDisplays}
      data-tooltip="Displays"
      aria-label="Open Displays"
      onclick={() => { showDisplays = !showDisplays; showPlayers = false; showLayoutMenu = false }}
    >
      <span class="icon">tv_displays</span>
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
  </div>
</aside>

{#if showLayoutMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="popover-backdrop" onclick={() => showLayoutMenu = false}></div>
  <div class="layout-popover">
    <div class="popover-header">
      <span class="popover-title">Layout</span>
      <button class="btn btn-icon" onclick={() => showLayoutMenu = false} aria-label="Close">
        <span class="icon">close</span>
      </button>
    </div>
    <div class="popover-content">

    <label class="toggle-row">
      <span>Player</span>
      <label class="toggle-switch">
        <input type="checkbox" checked={layout.showPlayer} onchange={() => layout.togglePlayer()} />
        <span class="toggle-slider"></span>
      </label>
    </label>

    <label class="toggle-row">
      <span>Queue</span>
      <label class="toggle-switch">
        <input type="checkbox" checked={layout.showQueue} onchange={() => layout.toggleQueue()} />
        <span class="toggle-slider"></span>
      </label>
    </label>

    <p class="popover-label" style="margin-top: var(--space-3)">Columns</p>
    {#each layout.columns.filter(c => c.key !== 'index') as col (col.key)}
      <label class="toggle-row">
        <span>{col.label}</span>
        <label class="toggle-switch">
          <input type="checkbox" checked={col.visible} onchange={() => layout.toggleColumn(col.key)} />
          <span class="toggle-slider"></span>
        </label>
      </label>
    {/each}
    </div><!-- /popover-content -->
  </div>
{/if}

{#if showPlayers}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="popover-backdrop" onclick={() => showPlayers = false}></div>
  <div class="players-popover">
    <PlayersView onclose={() => showPlayers = false} />
  </div>
{/if}

{#if showDisplays}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="popover-backdrop" onclick={() => showDisplays = false}></div>
  <div class="displays-popover">
    <DisplaysView onclose={() => showDisplays = false} />
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
    gap: 20px;
  }

  .sidebar-nav :global(.icon),
  .sidebar-bottom :global(.icon) {
    font-size: 36px;
  }

  .now-playing-btn { position: relative; }
  .np-dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--md-sys-color-primary);
    border: 2px solid var(--md-sys-color-surface);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
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
    min-width: 240px;
    width: max-content;
    z-index: var(--z-overlay);
    box-shadow: var(--elevation-2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .players-popover {
    position: fixed;
    left: 64px;
    top: 98px;
    background: var(--md-sys-color-surface-container-high);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-lg);
    width: 500px;
    max-height: calc(100vh - 124px);
    display: flex;
    flex-direction: column;
    z-index: var(--z-overlay);
    box-shadow: var(--elevation-2);
    overflow: hidden;
  }

  .displays-popover {
    position: fixed;
    left: 64px;
    top: 200px;
    background: var(--md-sys-color-surface-container-high);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-lg);
    width: 660px;
    display: flex;
    flex-direction: column;
    z-index: var(--z-overlay);
    box-shadow: var(--elevation-2);
    overflow: hidden;
  }

  .popover-backdrop {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-overlay) - 1);
  }

  .popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }

  .popover-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }

  .popover-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-bottom: var(--space-3);
  }

  .popover-label {
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--md-sys-color-on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: var(--space-1);
    padding: 0 var(--space-4);
    padding-top: var(--space-3);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface);
    padding: var(--space-1) var(--space-4);
    cursor: pointer;
  }
</style>
