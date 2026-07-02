<script lang="ts">
  import '@material/web/select/filled-select.js'
  import '@material/web/select/select-option.js'
  import '@material/web/switch/switch.js'
  import '@material/web/iconbutton/icon-button.js'
  import '@material/web/icon/icon.js'
  import '@material/web/divider/divider.js'
  import { appSettings } from '$lib/stores/settings.svelte'
</script>

<div class="settings-dialog">
  <section class="section">
    <h3 class="section-title">Appearance</h3>
    <label class="setting-row">
      <span>Theme</span>
      <md-filled-select
        value={appSettings.theme}
        onchange={(e: Event) => appSettings.setTheme((e.target as HTMLElement & { value: string }).value as 'dark' | 'light')}
        aria-label="Theme"
      >
        <md-select-option value="dark">Dark</md-select-option>
        <md-select-option value="light">Light</md-select-option>
      </md-filled-select>
    </label>
  </section>

  <md-divider></md-divider>

  <section class="section">
    <h3 class="section-title">Song Sources</h3>
    {#if appSettings.sources.length === 0}
      <p class="text-muted text-sm">No sources added yet.</p>
    {:else}
      {#each appSettings.sources as source (source.id)}
        <div class="source-row">
          <span class="source-label truncate text-sm">{source.label}</span>
          <span class="source-type text-xs text-muted">{source.type}</span>
          <md-switch
            selected={source.enabled}
            onchange={() => appSettings.toggleSource(source.id)}
            aria-label={`Enable ${source.label}`}
          ></md-switch>
          <md-icon-button
            onclick={() => appSettings.removeSource(source.id)}
            aria-label={`Remove ${source.label}`}
          >
            <md-icon>delete</md-icon>
          </md-icon-button>
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
    /* Remove extra padding around the divider */
    --md-divider-color: var(--md-sys-color-outline-variant);
    /* Size the theme select */
    --md-filled-select-text-field-container-shape: var(--radius-md);
    /* Icon button color for remove */
    --md-icon-button-icon-color: var(--md-sys-color-on-surface-variant);
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
