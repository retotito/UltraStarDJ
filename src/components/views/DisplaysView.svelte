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

  const PLAYER_COLOR_VAR: Record<number, string> = {
    1: 'var(--player-1)',
    2: 'var(--player-2)',
    3: 'var(--player-3)',
    4: 'var(--player-4)',
  }

  const activePlayers = $derived(playersStore.all.filter(p => p.active))
  const allPlayers = $derived(playersStore.all)

  async function toggleDisplay(id: 1 | 2) {
    console.log('[DisplaysView] toggleDisplay', id)
    const display = id === 1 ? displaysStore.display1 : displaysStore.display2
    console.log('[DisplaysView] display state', display)
    if (display.open) {
      console.log('[DisplaysView] closing', display.label)
      await closeDisplayWindow(display.label)
      displaysStore.setOpen(id, false)
    } else {
      console.log('[DisplaysView] opening', id)
      try {
        if (id === 1) await openBeamerWindow()
        else await openBeamer2Window()
        displaysStore.setOpen(id, true)
        setTimeout(() => sendScreenConfig({
          windowLabel: display.label,
          playerIds: display.playerIds,
        }), 800)
      } catch (e) {
        console.error('[DisplaysView] open failed', e)
      }
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

  <!-- Cards row -->
  <div class="displays-cards">
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
      {#each allPlayers as player (player.id)}
        <button
          class="player-chip"
          class:is-assigned={displaysStore.display1.playerIds.includes(player.id)}
          class:is-inactive={!player.active}
          style="--chip-color: {PLAYER_COLOR_VAR[player.id] ?? player.color}"
          disabled={!player.active}
          onclick={() => togglePlayer(1, player.id)}
        >
          {player.name || `Player ${player.id}`}
        </button>
      {/each}
      {#if allPlayers.length === 0}
        <span class="no-players">No players configured</span>
      {/if}
    </div>
  </div>

  <!-- Display 2 -->
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
        {#each allPlayers as player (player.id)}
          <button
            class="player-chip"
            class:is-assigned={displaysStore.display2.playerIds.includes(player.id)}
            class:is-inactive={!player.active}
            style="--chip-color: {PLAYER_COLOR_VAR[player.id] ?? player.color}"
            disabled={!player.active}
            onclick={() => togglePlayer(2, player.id)}
          >
            {player.name || `Player ${player.id}`}
          </button>
        {/each}
      </div>
    </div>
  </div><!-- /displays-cards -->
</div>

<style>
  .displays-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    width: 100%;
  }

  .displays-cards {
    display: flex;
    flex-direction: row;
    gap: var(--space-3);
    align-items: flex-start;
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
    width: 300px;
    flex-shrink: 0;
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
    border-radius: var(--radius-md);
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
    flex-direction: column;
    gap: var(--space-2);
  }

  .player-chip {
    width: 100%;
    height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--chip-color);
    background: transparent;
    color: var(--md-sys-color-on-surface);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: border-width 80ms ease, border-color 80ms ease;
  }

  .player-chip.is-assigned {
    border-width: 3px;
    border-color: var(--chip-color);
    font-weight: 700;
  }

  .player-chip.is-inactive {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .no-players {
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
    font-style: italic;
  }
</style>
