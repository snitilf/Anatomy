/**
 * Spotlights parts and lines on the map while the pointer or focus is on their row in the sidebar.
 * One style rule in the page, so the map does not render again.
 */
let sheet: HTMLStyleElement | undefined

/** The rules that let every line and label outside `keep` (an attribute selector) step back, each ink by its own share. */
export function stepBackRules(keep: string): string {
  // Lines fade by opacity. A label keeps its cutout, so only its words step back, by color, the same way as a faded label.
  // A line already stepped back by a selection stays where the spotlight put it.
  return `[data-hover-scope] g[data-ends]:not(${keep}):not([data-faded]) { opacity: var(--fade-light); }
[data-hover-scope] [data-label][data-ends]:not(${keep}):not(:hover):not([data-selected]) { color: color-mix(in srgb, var(--fg-2) var(--faded-label), transparent); }
[data-hover-scope] [data-label][data-ends][data-edited]:not(${keep}):not(:hover):not([data-selected]),
[data-hover-scope] [data-label][data-ends][data-mine]:not(${keep}):not(:hover):not([data-selected]) { color: color-mix(in srgb, var(--yours-text) var(--faded-label), transparent); }
[data-hover-scope] g[data-tone='strong'][data-ends]:not(${keep}):not([data-faded]) { opacity: var(--fade-strong); }
[data-hover-scope] g[data-tone='faint'][data-ends]:not(${keep}):not([data-faded]) { opacity: var(--fade-faint); }`
}

/** What a row in the sidebar points at on the map: parts by id, and lines by their edge id. */
export interface Spot {
  parts?: readonly string[]
  edges?: readonly string[]
  /** Group areas, by the id of their node (`group:<id>`), which take the wash of a hovered area in the far view. */
  groups?: readonly string[]
}

/** A reconnected connection is drawn under its edited id, so a row for it names both. */
const EDITED = 'edit:'

/** The edge ids a row may mean. */
const edgeIds = (edges: readonly string[]) => edges.flatMap((id) => (id.startsWith(EDITED) || id.startsWith('manual:') ? [id] : [id, `${EDITED}${id}`]))

/** One selector for every edge of a row, with `scope` before each and `after` behind each. */
const each = (ids: readonly string[], scope: string, tag: string, after = '') => ids.map((id) => `${scope} ${tag}[data-edge="${CSS.escape(id)}"]${after}`).join(',\n')

/** The look of selection, lighter: an accent edge and a thin ring, where selection has a thicker one. A selected card keeps its own. */
export function partRules(parts: readonly string[]): string {
  const nodes = parts.map((id) => `[data-hover-scope] .react-flow__node[data-id="${CSS.escape(id)}"] [data-card]:not([data-selected])`)
  // A tile in the far view has no edge to speak of, so it takes a tint of the accent.
  const tiles = parts.map((id) => `[data-hover-scope][data-far] .react-flow__node[data-id="${CSS.escape(id)}"] [data-card]:not([data-selected])`)
  return `${tiles.join(',\n')} { background: color-mix(in srgb, var(--accent) 60%, var(--bg)); }
${nodes.join(',\n')} { border-color: color-mix(in srgb, var(--accent) 70%, transparent); border-style: solid; box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 16%, transparent); opacity: 1; }`
}

/** An area in the far view, lifted the way the pointer on it lifts it, with a firmer edge. */
function groupRules(groups: readonly string[]): string {
  const areas = groups.map((id) => `[data-hover-scope][data-far] .react-flow__node[data-id="${CSS.escape(id)}"] > div`)
  return `${areas.join(',\n')} { background: color-mix(in srgb, var(--fg) var(--wash-share-2), transparent); border-color: var(--border-strong); }`
}

function edgeRules(edges: readonly string[]): string {
  const ids = edgeIds(edges)
  const keep = ids.map((id) => `[data-edge="${CSS.escape(id)}"]`).join(',')
  const far = '[data-hover-scope][data-far]'
  const quiet = '[data-hover-scope][data-labels="quiet"]'
  return `${stepBackRules(keep)}
${each(ids, '[data-hover-scope]', 'g')} { opacity: 1; }
${each(ids, '[data-hover-scope]', 'g', ' .react-flow__edge-path')} { stroke: var(--accent-line) !important; stroke-width: 1.75px !important; }
${each(ids, far, 'g')} { opacity: 1 !important; }
${each(ids, far, 'g', ' .react-flow__edge-path')} { stroke-dasharray: none !important; stroke-width: calc(2px * var(--label-scale, 1)) !important; }
${each(ids, '[data-hover-scope]', '[data-label]')} { color: var(--accent-line); }
${each(ids, quiet, '[data-label]')} { visibility: visible !important; opacity: 1 !important; }`
}

/**
 * Outlines parts and lines on the map while the pointer or focus is on their row in the sidebar.
 * A transient spotlight, lighter than selection's. It is one style rule in the page, so the map does not render again.
 * It never moves the camera: a target out of view shows nothing.
 */
export function spotlight(spot: Spot | undefined) {
  if (typeof document === 'undefined') return
  if (!sheet) {
    sheet = document.createElement('style')
    document.head.append(sheet)
  }
  const parts = spot?.parts ?? []
  const edges = spot?.edges ?? []
  const groups = spot?.groups ?? []
  sheet.textContent = [parts.length > 0 ? partRules(parts) : '', groups.length > 0 ? groupRules(groups) : '', edges.length > 0 ? edgeRules(edges) : ''].filter(Boolean).join('\n')
}
