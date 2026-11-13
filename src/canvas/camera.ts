import { getViewportForBounds, type ReactFlowInstance } from '@xyflow/react'

/** Space around the framed parts, as a share of the free area. */
export const FIT_PADDING = 0.08
export const FIT_MAX_ZOOM = 1.25
/** Below this zoom card text is too small to read. */
export const READABLE_ZOOM = 0.55
const WIDEST_VIEW = 0.15
/** Keeps the legend and the zoom buttons off the bottom row of cards. */
const CORNER_ROOM = 44
/** Room between the top of the map and the first card, in pixels, when the map shows a corner. */
const EDGE_ROOM = 24

interface Free {
  width: number
  height: number
  /** Pixels at the top that a notice covers. */
  top: number
}

/** The part of the map that nothing covers: the map itself, less the notices that float over its top. */
function freeArea(map: HTMLElement): Free {
  const box = map.getBoundingClientRect()
  let top = 0
  for (const el of document.querySelectorAll('[data-notices] > *')) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && r.bottom > box.top) top = Math.max(top, r.bottom - box.top + 8)
  }
  const bottom = CORNER_ROOM
  // Never let the covers eat the whole map.
  const room = Math.max(120, box.height - top - bottom)
  return { width: box.width, height: room, top }
}

export interface Frame {
  /** The parts to frame. Everything when it is empty. */
  ids?: readonly string[]
  padding?: number
  maxZoom?: number
  /** Whole-board framing only: when the board would need less than a readable zoom, show its top-left corner at a readable zoom instead. */
  readable?: boolean
  duration?: number
}

/** Frames parts of the map in the area that notices and the player leave free. Returns the size it used. */
export function frame(flow: ReactFlowInstance, map: HTMLElement | null, options: Frame = {}): { width: number; height: number } | undefined {
  if (!map) return undefined
  const { ids, padding = FIT_PADDING, maxZoom = FIT_MAX_ZOOM, readable = false, duration = 0 } = options
  const all = flow.getNodes()
  const nodes = ids && ids.length > 0 ? all.filter((n) => ids.includes(n.id)) : all
  if (nodes.length === 0) return undefined
  const free = freeArea(map)
  if (free.width <= 0) return undefined
  const bounds = flow.getNodesBounds(nodes)
  let { x, y, zoom } = getViewportForBounds(bounds, free.width, free.height, WIDEST_VIEW, maxZoom, padding)
  if (readable && zoom < READABLE_ZOOM) {
    zoom = READABLE_ZOOM
    x = EDGE_ROOM - bounds.x * zoom
    y = EDGE_ROOM - bounds.y * zoom
  }
  void flow.setViewport({ x, y: y + free.top, zoom }, { duration })
  return { width: free.width, height: map.getBoundingClientRect().height }
}
