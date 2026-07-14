<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  let { children } = $props()

  onMount(() => {
    // Disable right-click context menu and text selection in production Tauri builds.
    // During testing/beta, this is intentionally left enabled so DevTools (right-click → Inspect) works.
    // Re-enable for final release by changing the condition back to `isTauri && isProd`.
    const isTauri = '__TAURI_INTERNALS__' in window
    if (false && isTauri) {
      document.addEventListener('contextmenu', e => e.preventDefault())
      document.documentElement.style.userSelect = 'none'
      ;(document.documentElement.style as any).webkitUserSelect = 'none'
    }

    // ⌘+Option+I → open DevTools (works in prod .app where right-click → Inspect is unavailable)
    if (isTauri) {
      document.addEventListener('keydown', async (e) => {
        if (e.metaKey && e.altKey && e.key === 'i') {
          e.preventDefault()
          const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
          getCurrentWebviewWindow().openDevtools()
        }
      })
    }
  })
</script>

{@render children()}
