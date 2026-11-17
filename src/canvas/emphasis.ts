/**
 * Brings one connection forward on the map and lets the rest step back, while the pointer is on its row in the sidebar.
 * One style rule in the page, so the map does not render again.
 */
let sheet: HTMLStyleElement | undefined

/** The rules that let every line and label outside `keep` (an attribute selector) step back, each ink by its own share. */
export function stepBackRules(keep: string): string {
  const out = `[data-hover-scope] [data-ends]:not(${keep})`
  return `${out} { opacity: var(--fade-light); }
[data-hover-scope] g[data-tone='strong'][data-ends]:not(${keep}) { opacity: var(--fade-strong); }
[data-hover-scope] g[data-tone='faint'][data-ends]:not(${keep}) { opacity: var(--fade-faint); }`
}

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
  sheet.textContent = `${stepBackRules(`[data-edge="${edge}"]`)}
[data-hover-scope] [data-edge="${edge}"] { opacity: 1; --line-ink: var(--fg-2); }
[data-hover-scope][data-labels="quiet"] [data-label][data-edge="${edge}"] { visibility: visible !important; }`
}
