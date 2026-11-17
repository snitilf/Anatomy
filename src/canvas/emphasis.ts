/**
 * Brings one connection forward on the map and lets the rest step back, while the pointer is on its row in the sidebar.
 * One style rule in the page, so the map does not render again.
 */
let sheet: HTMLStyleElement | undefined

export function emphasizeConnection(id: string | undefined) {
  if (typeof document === 'undefined') return
  if (!sheet) {
    sheet = document.createElement('style')
    document.head.append(sheet)
  }
  if (id === undefined) {
    sheet.textContent = ''
    return
  }
  const edge = CSS.escape(id)
  sheet.textContent = `[data-hover-scope] [data-ends]:not([data-edge="${edge}"]) { opacity: 0.6; }
[data-hover-scope] [data-edge="${edge}"] { opacity: 1; --line-ink: var(--fg-2); }
[data-hover-scope][data-labels="quiet"] [data-label][data-edge="${edge}"] { visibility: visible !important; }`
}
