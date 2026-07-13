<script lang="ts">
  import { songbookStore } from '$lib/stores/songbook.svelte'

  let { onclose }: { onclose: () => void } = $props()

  function copyUrl(url: string | null) {
    if (url) navigator.clipboard.writeText(url)
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

    <!-- ── Local (same WiFi) ─────────────────────────────────────── -->
    <section class="section">
      <div class="section-label">
        <span class="icon icon-sm">wifi</span>
        Same Wi-Fi
      </div>
      <p class="description">Guests connect to your Wi-Fi and open the URL.</p>

      <div class="toggle-row">
        <span class="toggle-label">{songbookStore.active ? 'Live' : 'Off'}</span>
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
            <span class="icon">play_arrow</span> Start
          {/if}
        </button>
      </div>

      {#if songbookStore.active && songbookStore.url}
        <div class="url-row">
          <code class="url-text">{songbookStore.url}</code>
          <button class="btn btn-icon-sm" onclick={() => copyUrl(songbookStore.url)} aria-label="Copy URL">
            <span class="icon icon-sm">content_copy</span>
          </button>
        </div>
        <div class="qr-wrap">
          <img
            class="qr-img"
            src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data={encodeURIComponent(songbookStore.url)}"
            alt="QR code" width="180" height="180"
          />
        </div>
      {/if}
    </section>

    <div class="divider"></div>

    <!-- ── Public (internet tunnel) ─────────────────────────────── -->
    <section class="section">
      <div class="section-label">
        <span class="icon icon-sm">public</span>
        Any Network (internet tunnel)
      </div>
      <p class="description">Guests use their mobile data — no Wi-Fi needed. Requires internet on this laptop.</p>

      <div class="toggle-row">
        <span class="toggle-label">{songbookStore.tunnelActive ? 'Live' : 'Off'}</span>
        <button
          class="btn btn-filled toggle-btn"
          class:btn-danger={songbookStore.tunnelActive}
          disabled={songbookStore.tunnelLoading}
          onclick={() => songbookStore.toggleTunnel()}
        >
          {#if songbookStore.tunnelLoading}
            <span class="icon spinning">sync</span>
          {:else if songbookStore.tunnelActive}
            <span class="icon">stop</span> Stop
          {:else}
            <span class="icon">rocket_launch</span> Start
          {/if}
        </button>
      </div>

      {#if songbookStore.tunnelActive && songbookStore.tunnelUrl}
        <div class="url-row">
          <code class="url-text">{songbookStore.tunnelUrl}</code>
          <button class="btn btn-icon-sm" onclick={() => copyUrl(songbookStore.tunnelUrl)} aria-label="Copy URL">
            <span class="icon icon-sm">content_copy</span>
          </button>
        </div>

        {#if songbookStore.tunnelPin}
          <div class="pin-block">
            <div class="pin-label">Show guests this PIN:</div>
            <div class="pin-display">{songbookStore.tunnelPin}</div>
          </div>
        {/if}

        <div class="qr-wrap">
          <img
            class="qr-img"
            src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data={encodeURIComponent(songbookStore.tunnelUrl)}"
            alt="QR code" width="180" height="180"
          />
        </div>
        <p class="qr-note">Tunnel via localtunnel.me · QR code requires internet</p>
      {/if}
    </section>

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
    max-height: 80vh;
    overflow-y: auto;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--md-sys-color-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .divider {
    height: 1px;
    background: var(--md-sys-color-outline-variant);
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

  .pin-block {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--md-sys-color-surface-container);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
  }

  .pin-label {
    font-size: var(--text-xs);
    color: var(--md-sys-color-on-surface-variant);
  }

  .pin-display {
    font-size: var(--text-lg);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.2em;
    color: var(--md-sys-color-primary);
  }

  .qr-wrap {
    background: white;
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    display: inline-block;
    align-self: center;
  }

  .qr-img { display: block; }

  .qr-note {
    font-size: 11px;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.6;
    text-align: center;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
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
