/**
 * Svelte action: tooltip — appends tooltip to document.body so it's never clipped by overflow.
 * Usage: <button use:tooltip={'Your message here'}>
 *        <span use:tooltip={condition ? 'Message' : undefined}>
 */

let el: HTMLDivElement | null = null

function getEl(): HTMLDivElement {
  if (!el) {
    el = document.createElement('div')
    el.className = 'app-tooltip'
    document.body.appendChild(el)
  }
  return el
}

function show(anchor: HTMLElement, text: string) {
  const tip = getEl()
  tip.textContent = text
  tip.style.display = 'block'
  const r = anchor.getBoundingClientRect()
  tip.style.left = `${r.left + r.width / 2}px`
  tip.style.top = `${r.top - 8}px`
  tip.style.transform = 'translateX(-50%) translateY(-100%)'
  tip.style.opacity = '1'
}

function hide() {
  if (el) { el.style.opacity = '0'; el.style.display = 'none' }
}

export function tooltip(node: HTMLElement, text: string | undefined) {
  // Disabled buttons block pointer events — override so hover still works
  const wasPointerEvents = node.style.pointerEvents
  if (text) node.style.pointerEvents = 'auto'

  function onEnter() { if (text) show(node, text) }
  function onLeave() { hide() }

  if (text) {
    node.addEventListener('mouseenter', onEnter)
    node.addEventListener('mouseleave', onLeave)
  }

  return {
    update(newText: string | undefined) {
      text = newText
      node.style.pointerEvents = newText ? 'auto' : wasPointerEvents
      node.removeEventListener('mouseenter', onEnter)
      node.removeEventListener('mouseleave', onLeave)
      if (text) {
        node.addEventListener('mouseenter', onEnter)
        node.addEventListener('mouseleave', onLeave)
      } else {
        hide()
      }
    },
    destroy() {
      node.removeEventListener('mouseenter', onEnter)
      node.removeEventListener('mouseleave', onLeave)
      node.style.pointerEvents = wasPointerEvents
      hide()
    },
  }
}
