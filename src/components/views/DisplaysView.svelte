<script lang="ts">
  import { displaysStore } from '$lib/stores/displays.svelte'
  import { playersStore } from '$lib/stores/players.svelte'
  import {
    openBeamerWindow,
    openBeamer2Window,
    closeDisplayWindow,
    sendScreenConfig,
    WINDOW_LABELS,
  } from '$lib/ipc/tauri'

  let { onclose }: { onclose?: () => void } = $props()

  const activePlayers = $derived(playersStore.all.filter(p => p.active))
  const canHaveSecond = $derived(activePlayers.length >= 3)

  async function toggleDisplay(id: 1 | 2) {
    const display = id === 1 ? displaysStore.display1 : displaysStore.display2
    if (display.open) {
      await closeDisplayWindow(display.label)
      displaysStore.setOpen(id, false)
    } else {
      if (id === 1) await openBeamerWindow()
      else await openBeamer2Window()
      displaysStore.setOpen(id, true)
      // send current config after a short delay so the window has time to load
      setTimeout(() => sendScreenConfig({
        windowLabel: display.label,
        playerIds: display.playerIds,
      }), 800)
    }
  }

  function togglePlayer(displayId: 1 | 2, playerId: number) {
    displaysStore.togglePlayer(displayId, playerId)
    // push updated config if display is open
    const display = displayId === 1 ? displaysStore.display1 : displaysStore.display2
    if (display.open) {
      sendScreenConfig({ windowLabel: display.label, playerIds: display.playerIds })
    }
  }
</script>

<div class="displays-view">
  <div class="view-header">
    <span class="view-title">Displays</span>
    {#if onclose}
      <button class="btn btn-icon" onclick={onclose} aria-label="Close">
        <span class="icon">close</span>
      </button>
    {/if}
  </div>

  <!-- Display 1 -->
  <div class="display-card">
    <div class="display-header">
      <span class="icon display-icon">tv</span>
      <span class="display-name">Display 1</span>
      <button
        class="btn btn-sm"
        class:btn-danger={displaysStore.display1.open}
        onclick={() => toggleDisplay(1)}
      >
        {displaysStore.display1.open ? 'Close' : 'Open'}
      </button>
    </div>

    <div class="player-chips">
      {#each activePlayers as player (player.id)}
        <button
          class="player-chip"
          class:is-assigned={displaysStore.display1.playerIds.includes(player.id)}
          style="--chip-color: {player.color}"
          onclick={() => togglePlayer(1, player.id)}
        >
          P{player.id}
        </button>
      {/each}
      {#if activePlayers.length === 0}
        <span class="no-players">No active players</span>
      {/if}
    </div>
  </div>

  <!-- Display 2 — only shown when ≥3 active players -->
  {#if canHaveSecond}
    <div class="display-card">
      <div class="display-header">
        <span class="icon display-icon">tv</span>
        <span class="display-name">Display 2</span>
        <button
          class="btn btn-sm"
          class:btn-danger={displaysStore.display2.open}
          onclick={() => toggleDisplay(2)}
        >
          {displaysStore.display2.open ? 'Close' : 'Open'}
        </button>
      </div>

      <div class="player-chips">
        {#each activePlayers as player (player.id)}
          <button
            class="player-chip"
            class:is-assigned={displaysStore.display2.playerIds.includes(player.id)}
            style="--chip-color: {player.color}"
            onclick={() => togglePlayer(2, player.id)}
          >
            P{player.id}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .displays-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-3);
    width: 100%;
  }

  .view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .view-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--md-sys-color-on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  /* ── Display card ── */
  .display-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    background: var(--md-sys-color-surface-container);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
  }

  .display-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .display-icon {
    color: var(--md-sys-color-on-surface-variant);
    font-size: 20px;
  }

  .display-name {
    flex: 1;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }

  .btn-sm {
    padding: 4px 12px;
    font-size: var(--text-xs);
    border-radius: var(--radius-full);
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }

  .btn-sm:hover { opacity: 0.85; }

  .btn-sm.btn-danger {
    background: #f75f5f;
    color: #fff;
  }

  /* ── Player chips ── */
  .player-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .player-chip {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full);
    border: 2px solid var(--chip-color);
    background: transparent;
    color: var(--chip-color);
    font-size: var(--text-sm);
    font-weight: 700;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .player-chip.is-assigned {
    background: var(--chip-color);
    color: #fff;
  }

  .no-players {
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
    font-style: italic;
  }
</style>
