<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    open = false,
    title = '',
    onclose,
    children
  }: {
    open?: boolean
    title?: string
    onclose?: () => void
    children: Snippet
  } = $props()

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose?.()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose?.()
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
    <div class="panel" role="dialog" aria-modal="true">
      {#if title}
        <header class="modal-header">
          <span class="modal-title">{title}</span>
          <button class="btn btn-icon" onclick={onclose} aria-label="Close">
            <span class="icon">close</span>
          </button>
        </header>
      {/if}
      <div class="modal-body">
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .panel {
    background: var(--md-sys-color-surface-container-high);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-xl);
    min-width: 400px;
    max-width: 560px;
    width: 90%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--elevation-3);
    overflow: hidden;
    animation: slideUp 0.25s ease-out;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-4) var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }

  .modal-title {
    font-size: var(--text-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--md-sys-color-on-surface);
  }

  .modal-body {
    padding: var(--space-6);
    overflow-y: auto;
    flex: 1;
  }
</style>
