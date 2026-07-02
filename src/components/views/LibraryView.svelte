<script lang="ts">
  // LibraryView — DJ's main screen
  // Sprint 1: song table, search, filter, queue sidebar
</script>

<div class="library-view">
  <header class="toolbar">
    <span class="text-xl font-semibold">UltrastarDJ</span>
  </header>

  <div class="content">
    <p class="text-muted">Library loading… (Sprint 1)</p>
  </div>
</div>

<style>
  .library-view {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--md-sys-color-background);
    color: var(--md-sys-color-on-background);
  }

  .toolbar {
    display: flex;
    align-items: center;
    padding: var(--space-3) var(--space-6);
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    height: 56px;
    flex-shrink: 0;
  }

  .content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
</style>
