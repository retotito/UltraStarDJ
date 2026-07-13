<script lang="ts">
  import { songbookStore } from '$lib/stores/songbook.svelte'

  let { onclose }: { onclose: () => void } = $props()

  function copyUrl() {
    if (songbookStore.url) navigator.clipboard.writeText(songbookStore.url)
  }
</script>

<div class="songbook-view">
  <div class="panel-header">
    <span class="panel-title">Songbook</span>
    <button class="btn btn-icon-sm" aria-label="Close" onclick={onclose}>
      <span class="icon icon-sm">close</span>
    </button>
  </div>

  <div class="panel-body">
    <p class="description">
      Share your song list with party guests.<br/>
      They connect to your Wi-Fi and open the URL.
    </p>

    <div class="toggle-row">
      <span class="toggle-label">{songbookStore.active ? 'Songbook is live' : 'Songbook is off'}</span>
      <button
        class="btn btn-filled toggle-btn"
        class:btn-danger={songbookStore.active}
        disabled={songbookStore.loading}
        onclick={() => songbookStore.toggle()}
      >
        {#if songbookStore.loading}
          <span class="icon spinning">sync</span>
        {:else if songbookStore.active}
          <span class="icon">stop</span> Stop
        {:else}
          <span class="icon">wifi</span> Start
        {/if}
      </button>
    </div>

    {#if songbookStore.active && songbookStore.url}
      <div class="url-block">
        <div class="url-label">Share this URL with your guests:</div>
        <div class="url-row">
          <code class="url-text">{songbookStore.url}</code>
          <button class="btn btn-icon-sm" onclick={copyUrl} aria-label="Copy URL">
            <span class="icon icon-sm">content_copy</span>
          </button>
        </div>
      </div>

      <div class="qr-block">
        <div class="qr-label">Or scan this QR code:</div>
        <div class="qr-wrap">
          <img
            class="qr-img"
            src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={encodeURIComponent(songbookStore.url)}"
            alt="QR code"
            width="200"
            height="200"
          />
        </div>
        <p class="qr-note">QR code requires internet to generate</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .songbook-view {
    width: 300px;
    background: var(--md-sys-color-surface-container-high);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--radius-lg);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }

  .panel-title {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--md-sys-color-on-surface);
  }

  .panel-body {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .description {
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.5;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .toggle-label {
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface);
  }

  .url-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .url-label {
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
  }

  .url-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--md-sys-color-surface-container);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
  }

  .url-text {
    flex: 1;
    font-size: var(--text-xs);
    color: var(--md-sys-color-primary);
    word-break: break-all;
  }

  .qr-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: center;
  }

  .qr-label {
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
    align-self: flex-start;
  }

  .qr-wrap {
    background: white;
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    display: inline-block;
  }

  .qr-img { display: block; }

  .qr-note {
    font-size: 11px;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.6;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
