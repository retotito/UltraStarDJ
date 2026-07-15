<script lang="ts">
  import { appSettings } from '$lib/stores/settings.svelte'
  import Select from '$components/ui/Select.svelte'
  import BeamerDisplaySettings from '$components/dialogs/BeamerDisplaySettings.svelte'
  import DifficultySetting from '$components/dialogs/DifficultySetting.svelte'
</script>

<div class="settings-dialog">
  <section class="section">
    <h3 class="section-title">Appearance</h3>
    <div class="setting-row">
      <span style="margin-right: var(--space-2);">Theme</span>
      <Select
        value={appSettings.theme}
        options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
        onchange={(v) => appSettings.setTheme(v as 'dark' | 'light')}
      />
    </div>
  </section>

  <section class="section">
    <h3 class="section-title">Beamer Display</h3>
    <BeamerDisplaySettings />

    <h3 class="section-title">Game</h3>
    <DifficultySetting />
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
</style>
