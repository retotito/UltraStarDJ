<script lang="ts">
  import { layout } from '$lib/stores/layout.svelte'
</script>

<div class="beamer-settings">
  <div class="setting-row">
    <span>Piano roll grid lines</span>
    <label class="toggle">
      <input
        type="checkbox"
        checked={layout.showPianoRollLines}
        onchange={() => layout.togglePianoRollLines()}
      />
      <span class="slider"></span>
    </label>
  </div>

  <div class="setting-row">
    <span>Syllables on note bars</span>
    <label class="toggle">
      <input
        type="checkbox"
        checked={layout.showNoteSyllables}
        onchange={() => layout.toggleNoteSyllables()}
      />
      <span class="slider"></span>
    </label>
  </div>

  <div class="setting-row">
    <span>Note bar style</span>
    <div class="segmented">
      <button
        class="seg-btn"
        class:active={layout.noteBarStyle === 'white'}
        onclick={() => { if (layout.noteBarStyle !== 'white') layout.toggleNoteBarStyle() }}
      >White</button>
      <button
        class="seg-btn"
        class:active={layout.noteBarStyle === 'black'}
        onclick={() => { if (layout.noteBarStyle !== 'black') layout.toggleNoteBarStyle() }}
      >Black</button>
    </div>
  </div>
</div>

<style>
  .beamer-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-surface);
  }

  /* ── Toggle switch ── */
  .toggle {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 22px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }

  .slider {
    position: absolute;
    inset: 0;
    background: var(--md-sys-color-surface-variant);
    border-radius: 22px;
    transition: background 0.2s;
  }

  .slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 3px;
    top: 3px;
    background: var(--md-sys-color-on-surface-variant);
    border-radius: 50%;
    transition: transform 0.2s, background 0.2s;
  }

  .toggle input:checked + .slider {
    background: var(--md-sys-color-primary);
  }

  .toggle input:checked + .slider::before {
    transform: translateX(18px);
    background: var(--md-sys-color-on-primary);
  }

  /* ── Segmented control ── */
  .segmented {
    display: flex;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .seg-btn {
    padding: 3px 12px;
    font-size: var(--text-sm);
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    border: none;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .seg-btn:not(:last-child) {
    border-right: 1px solid var(--md-sys-color-outline);
  }

  .seg-btn.active {
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
  }
</style>
