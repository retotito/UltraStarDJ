<script lang="ts">
  import { appSettings } from '$lib/stores/settings.svelte'
</script>

<div class="settings-dialog">
  <section class="section">
    <h3 class="section-title">Appearance</h3>
    <div class="setting-row">
      <span>Theme</span>
      <select
        class="select"
        value={appSettings.theme}
        onchange={(e) => appSettings.setTheme((e.target as HTMLSelectElement).value as 'dark' | 'light')}
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>
    </div>
  </section>

  <div class="divider"></div>

  <section class="section">
    <h3 class="section-title">Song Sources</h3>
    {#if appSettings.sources.length === 0}
      <p class="text-muted text-sm">No sources added yet.</p>
    {:else}
      {#each appSettings.sources as source (source.id)}
        <div class="source-row">
          <span class="source-label truncate text-sm">{source.label}</span>
          <span class="source-type text-xs text-muted">{source.type}</span>
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked={source.enabled}
              onchange={() => appSettings.toggleSource(source.id)}
            />
            <span class="toggle-slider"></span>
          </label>
          <button
            class="btn btn-icon-sm"
            onclick={() => appSettings.removeSource(source.id)}
            aria-label={`Remove ${source.label}`}
          >
            <span class="icon icon-sm">delete</span>
          </button>
        </div>
      {/each}
    {/if}
    <p class="text-xs text-muted" style="margin-top: var(--space-3)">
      Adding local folders and USDB support coming in Sprint 1.
    </p>
  </section>
</div>

<style>
  .settings-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .section-title {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--md-sys-color-on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface);
  }

  .source-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--md-sys-color-surface-container);
    border-radius: var(--radius-md);
  }

  .source-label { flex: 1; min-width: 0; }

  .source-type {
    background: var(--md-sys-color-surface-container-highest);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }
</style>
