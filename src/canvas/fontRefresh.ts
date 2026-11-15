/** What a map view needs for the refresh after fonts load. */
export interface Refreshable {
  /** A card is under the pointer. */
  held?: string | undefined
  /** Lines of a moved card wait for the full build, and an unsaved move waits for its save. */
  settle?: number | undefined
  /** Fonts loaded while the view was busy: it is built again once it is idle. */
  fontStale?: true
}

const busy = (v: Refreshable) => v.held !== undefined || v.settle !== undefined

/**
 * Fonts have loaded. An idle view is built again now, from the cards where they are. A view that a card is held in, or
 * that waits for a keyboard move to settle, is only marked, so nothing in motion or unsaved is reset.
 */
export function fontsLoaded<V extends Refreshable>(view: V, rebuild: (view: V) => V): V {
  return busy(view) ? { ...view, fontStale: true } : rebuild(view)
}

/** A marked view that has become idle, after a drop, an Escape, or a settled move, is built again, once. */
export function refreshWhenIdle<V extends Refreshable>(view: V, rebuild: (view: V) => V): V {
  return view.fontStale && !busy(view) ? rebuild(view) : view
}

/**
 * The full build after a drop or a settled move. It normally reuses the lines that nothing touched. With a font refresh
 * owed it does not: it is the one build that refreshes, and the new view carries no mark, so nothing builds again.
 */
export function buildAfterMove<V extends Refreshable>(old: V, build: (reuse: boolean) => V): V {
  return build(!old.fontStale)
}
