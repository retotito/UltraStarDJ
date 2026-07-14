<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  let { children } = $props()

  onMount(() => {
    const isTauri = '__TAURI_INTERNALS__' in window
    console.log(`[app] startup — origin: ${window.location.origin} isTauri: ${isTauri}`)
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
