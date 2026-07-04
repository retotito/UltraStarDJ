<script lang="ts">
  import type { SongValidationError } from '$lib/ultrastar/validate_song'

  let {
    errors,
    onclose,
  }: {
    errors: SongValidationError[]
    onclose: () => void
  } = $props()

  const FIELD_LABELS: Record<string, string> = {
    title:          'Title',
    artist:         'Artist',
    bpm:            'BPM',
    audio:          'Audio source',
    txtPath:        'Song file',
    audioPath:      'Audio file',
    videoPath:      'Video file',
    backgroundPath: 'Background image',
    coverPath:      'Cover image',
  }
</script>

<div class="validation-dialog">
  <div class="dialog-icon-row">
    <span class="icon warn-icon">warning</span>
    <span class="dialog-headline">Song cannot be loaded</span>
  </div>

  <ul class="error-list">
    {#each errors as err}
      <li class="error-item">
        <span class="error-field">{FIELD_LABELS[err.field] ?? err.field}</span>
        <span class="error-message">{err.message}</span>
      </li>
    {/each}
  </ul>

  <div class="dialog-actions">
    <button class="btn btn-primary" onclick={onclose}>OK</button>
  </div>
</div>

<style>
  .validation-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .dialog-icon-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .warn-icon {
    font-size: 28px;
    color: var(--md-sys-color-error);
    flex-shrink: 0;
  }

  .dialog-headline {
    font-size: var(--text-base);
    font-weight: var(--font-weight-semibold);
    color: var(--md-sys-color-on-surface);
  }

  .error-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .error-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--md-sys-color-error-container);
    border-radius: var(--radius-md);
  }

  .error-field {
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--md-sys-color-on-error-container);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
  }

  .error-message {
    font-size: var(--text-sm);
    color: var(--md-sys-color-on-error-container);
    word-break: break-all;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
  }

  .btn-primary {
    padding: var(--space-2) var(--space-5);
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
  }

  .btn-primary:hover {
    opacity: 0.85;
  }
</style>
