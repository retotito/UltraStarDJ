<script lang="ts">
  import { appSettings, DIFFICULTY_TOLERANCE, type Difficulty } from '$lib/stores/settings.svelte'

  const levels: { value: Difficulty; label: string; desc: string }[] = [
    { value: 'easy',   label: 'Easy',   desc: '±2 semitones' },
    { value: 'medium', label: 'Medium', desc: '±1 semitone'  },
    { value: 'hard',   label: 'Hard',   desc: 'exact match'  },
  ]

  function select(d: Difficulty) {
    appSettings.set('difficulty', d)
    appSettings.save()
  }
</script>

<div class="difficulty-setting">
  <div class="setting-label">Pitch Difficulty</div>
  <div class="seg-control">
    {#each levels as lvl (lvl.value)}
      <button
        class="seg-btn"
        class:active={appSettings.difficulty === lvl.value}
        onclick={() => select(lvl.value)}
      >
        <span class="seg-label">{lvl.label}</span>
        <span class="seg-desc">{lvl.desc}</span>
      </button>
    {/each}
  </div>
  <p class="hint">
    How closely you need to match the pitch.
    Tolerance is octave-invariant — C3 matches C4.
  </p>
</div>

<style>
  .difficulty-setting {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .setting-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--md-sys-color-on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .seg-control {
    display: flex;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: 8px;
    overflow: hidden;
  }

  .seg-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: none;
    border-right: 1px solid var(--md-sys-color-outline-variant);
    cursor: pointer;
    transition: background 0.15s;
    color: var(--md-sys-color-on-surface-variant);
  }

  .seg-btn:last-child {
    border-right: none;
  }

  .seg-btn:hover {
    background: var(--md-sys-color-surface-variant);
  }

  .seg-btn.active {
    background: var(--md-sys-color-primary-container, #1e3a5f);
    color: var(--md-sys-color-on-primary-container, #fff);
  }

  .seg-label {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .seg-desc {
    font-size: var(--text-xs, 0.72rem);
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }

  .hint {
    font-size: var(--text-xs, 0.72rem);
    color: var(--md-sys-color-on-surface-variant);
    margin: 0;
    opacity: 0.8;
  }
</style>
