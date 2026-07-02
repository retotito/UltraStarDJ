<script lang="ts">
  import type { PlaySongPayload } from '$lib/ultrastar/types'

  let { payload }: { payload: PlaySongPayload | null } = $props()
</script>

<div class="beamer-view">
  {#if payload}
    <p class="text-lg font-semibold">{payload.song.artist} — {payload.song.title}</p>
    <p class="text-muted text-sm">Playback coming in Sprint 3</p>
  {:else}
    <div class="idle-screen">
      <span class="logo-text">UltrastarDJ</span>
      <span class="text-muted text-sm">Waiting for DJ…</span>
    </div>
  {/if}
</div>

<style>
  .beamer-view {
    width: 100vw;
    height: 100vh;
    background: #000;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
  }

  .idle-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .logo-text {
    font-size: 3rem;
    font-weight: var(--font-weight-bold);
    color: var(--md-sys-color-primary);
    letter-spacing: 0.05em;
  }
</style>
