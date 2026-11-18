/** The two views of a board: the map, and the Overview page. The URL hash holds the view, so back and forward move between them. */
export type View = 'map' | 'overview'

const KEY = 'anatomy:views'
const HASH = '#overview'

/** The view the hash names. No hash is the map. */
export function viewFromHash(hash: string): View {
  return hash === HASH ? 'overview' : 'map'
}

function readAll(): Record<string, View> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as unknown
    const out: Record<string, View> = {}
    if (raw && typeof raw === 'object') {
      for (const [id, view] of Object.entries(raw)) if (view === 'map' || view === 'overview') out[id] = view
    }
    return out
  } catch {
    return {}
  }
}

/** The view last used on a board in this browser. A board never opened before is on the map. */
export function rememberedView(boardId: string): View {
  return readAll()[boardId] ?? 'map'
}

export function rememberView(boardId: string, view: View): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [boardId]: view }))
  } catch {
    // Without storage the board opens on the map next time.
  }
}

/** Puts the view in the address. `push` adds a history entry, so back returns to the other view. */
export function writeHash(view: View, push: boolean): void {
  const url = `${window.location.pathname}${window.location.search}${view === 'overview' ? HASH : ''}`
  if (viewFromHash(window.location.hash) === view) return
  if (push) window.history.pushState(null, '', url)
  else window.history.replaceState(null, '', url)
}
