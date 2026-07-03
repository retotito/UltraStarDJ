<script lang="ts">
  interface Option {
    value: string
    label: string
    disabled?: boolean
    takenBy?: { label: string; color: string }
  }

  interface Props {
    value: string
    options: Option[]
    onchange: (value: string) => void
    disabled?: boolean
    class?: string
  }

  let { value, options, onchange, disabled = false, class: className = '' }: Props = $props()

  let isOpen = $state(false)
  let triggerEl = $state<HTMLButtonElement | null>(null)
  let menuPos = $state({ top: 0, left: 0, width: 0, openUp: false })

  const selectedLabel = $derived(options.find(o => o.value === value)?.label ?? options[0]?.label ?? '')

  const MAX_MENU_HEIGHT = 320
  const MENU_GAP = 4

  function openMenu() {
    if (!triggerEl) return
    const r = triggerEl.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom - MENU_GAP
    const spaceAbove = r.top - MENU_GAP
    const openUp = spaceBelow < Math.min(MAX_MENU_HEIGHT, options.length * 40) && spaceAbove > spaceBelow
    menuPos = {
      top: openUp ? r.top - MENU_GAP : r.bottom + MENU_GAP,
      left: r.left,
      width: r.width,
      openUp,
    }
    isOpen = true
  }

  function toggle() {
    if (disabled) return
    if (isOpen) isOpen = false
    else openMenu()
  }

  function select(v: string) {
    onchange(v)
    isOpen = false
  }

  function close(e: MouseEvent) {
    e.stopPropagation()
    isOpen = false
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="select-backdrop" onclick={close}></div>
  <div
    class="select-menu"
    class:open-up={menuPos.openUp}
    style="top: {menuPos.top}px; left: {menuPos.left}px; width: {menuPos.width}px;"
  >
    {#each options as opt}
      <button
        type="button"
        class="select-item"
        class:is-selected={opt.value === value}
        class:is-disabled={opt.disabled}
        disabled={opt.disabled}
        onclick={() => select(opt.value)}
      >
        <span class="badge-slot">
          {#if opt.takenBy}
            <span class="taken-badge" style="background: {opt.takenBy.color}">{opt.takenBy.label}</span>
          {/if}
        </span>
        <div class="item-label">{opt.label}</div>
        {#if opt.value === value}
          <span class="icon icon-sm">check</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<button
  type="button"
  bind:this={triggerEl}
  class="select-trigger {className}"
  class:is-open={isOpen}
  class:is-disabled={disabled}
  {disabled}
  onclick={toggle}
>
  <div class="select-trigger-label">{selectedLabel}</div>
  <span class="icon icon-sm">expand_more</span>
</button>

<style>
  .select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    height: 36px;
    padding: 0 var(--space-3);
    background: var(--md-sys-color-surface-container);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-lg);
    color: var(--md-sys-color-on-surface);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    cursor: pointer;
    width: 100%;
    transition: border-color var(--transition-fast);
    -webkit-tap-highlight-color: transparent;
    white-space: nowrap;
    overflow: hidden;
  }

  .select-trigger:hover {
    border-color: var(--md-sys-color-outline);
  }

  .select-trigger.is-open,
  .select-trigger:focus-visible {
    outline: 3px solid var(--md-sys-color-primary);
    outline-offset: -1px;
    border-color: var(--md-sys-color-primary);
  }

  .select-trigger-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  .item-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge-slot {
    flex-shrink: 0;
    width: 24px;
    display: flex;
    align-items: center;
  }

  .taken-badge {
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    color: #fff;
    letter-spacing: 0.03em;
  }

  .select-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .select-menu {
    position: fixed;
    z-index: 1000;
    background: var(--md-sys-color-surface-container-high);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-lg);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    overflow-y: auto;
    max-height: 320px;
  }

  .select-menu.open-up {
    transform: translateY(-100%);
  }

  .select-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    color: var(--md-sys-color-on-surface);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast);
    -webkit-tap-highlight-color: transparent;
  }

  .select-item:last-child {
    border-bottom: none;
  }

  .select-item:hover {
    background: var(--md-sys-color-surface-container-highest);
  }

  .select-item.is-selected {
    color: var(--md-sys-color-primary);
    font-weight: var(--font-weight-medium);
  }

  .select-item.is-disabled,
  .select-item:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .select-trigger.is-disabled,
  .select-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
