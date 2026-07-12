<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  let { children } = $props()

  onMount(() => {
    // Only in production Tauri builds — disable right-click and text selection
    const isTauri = '__TAURI_INTERNALS__' in window
    const isProd = !import.meta.env.DEV
    if (isTauri && isProd) {
      document.addEventListener('contextmenu', e => e.preventDefault())
      document.documentElement.style.userSelect = 'none'
      ;(document.documentElement.style as any).webkitUserSelect = 'none'
    }
  })
</script>

{@render children()}
