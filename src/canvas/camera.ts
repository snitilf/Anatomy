import type { CoordinateExtent, ReactFlowInstance, Viewport } from '@xyflow/react'
import type { Rect } from '../layout/geometry'
import type { Mark, Proposal } from '../layer/model'

/** The closest the map can zoom in. */
export const MAX_ZOOM = 2
/** Fitting never enlarges a small board past its real size. */
export const FIT_MAX_ZOOM = 1
/** Opening a board fits it when that leaves text readable. Below this, it shows the start of the flow at `START_ZOOM`. */
export const READABLE_ZOOM = 0.6
export const START_ZOOM = 0.8
/** Room around the content when it is fitted, in screen pixels. */
const FIT_ROOM = 32
/** How far past the content the map can be panned, in board pixels. */
export const PAN_MARGIN = 320
/** Keeps the zoom bar off the bottom row of cards. */
const CORNER_ROOM = 48
/** Room between the top of the map and the first card, in pixels, when the map shows the start of the flow. */
const EDGE_ROOM = 24
/** The zoom steps of the zoom buttons and keys. */
export const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2] as const

export interface Size {
  width: number
  height: number
}

/** How far the map can zoom and pan, worked out from what is on it and the size of the map. */
export interface Limits {
  minZoom: number
  maxZoom: number
  /** The zoom that shows all the content. */
  fitZoom: number
  extent: CoordinateExtent
  /** Everything on the map: cards, group areas, marks, and proposed parts. */
  bounds: Rect
}

function union(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** The box around one mark, in board coordinates. An arrow counts only by its free ends. */
function markBox(mark: Mark): Rect | undefined {
  switch (mark.kind) {
    case 'stroke': {
      const xs = mark.points.map((p) => p.x)
      const ys = mark.points.map((p) => p.y)
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
    }
    case 'arrow': {
      const ends = [mark.from, mark.to].flatMap((e) => (e.type === 'point' ? [{ x: e.x, y: e.y, width: 0, height: 0 }] : []))
      return union(ends)
    }
    default:
      return { x: mark.x, y: mark.y, width: mark.width, height: mark.height }
  }
}

/** Everything on the map, as one box: cards, group areas, marks, and proposed parts. */
export function contentBounds(
  cards: readonly Rect[],
  groups: readonly Rect[] = [],
  marks: readonly Mark[] = [],
  proposals: readonly Proposal[] = [],
): Rect | undefined {
  const boxes: Rect[] = [...cards, ...groups, ...proposals.map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height }))]
  for (const m of marks) {
    const box = markBox(m)
    if (box) boxes.push(box)
  }
  return union(boxes)
}

/** The zoom that shows the whole box in an area, with some room around it. */
export function fitZoomFor(bounds: Rect, area: Size): number {
  const width = Math.max(1, area.width - FIT_ROOM * 2)
  const height = Math.max(1, area.height - FIT_ROOM * 2)
  return Math.min(width / Math.max(1, bounds.width), height / Math.max(1, bounds.height))
}

/**
 * The zoom and pan limits for a map of this size. Zooming out stops where the whole content fits, and never below 100%
 * would be needed for a small board, so the map never shows more than its content needs. Panning stops a margin past
 * the content.
 */
export function zoomLimits(bounds: Rect | undefined, map: Size): Limits {
  const box = bounds ?? { x: 0, y: 0, width: 1, height: 1 }
  // The zoom bar takes the bottom corner, so the fit leaves room for it.
  const fitZoom = map.width > 0 && map.height > 0 ? fitZoomFor(box, { width: map.width, height: Math.max(120, map.height - CORNER_ROOM) }) : 1
  const minZoom = Math.max(0.02, Math.min(fitZoom, 1))
  return {
    minZoom,
    maxZoom: MAX_ZOOM,
    fitZoom,
    bounds: box,
    extent: [
      [box.x - PAN_MARGIN, box.y - PAN_MARGIN],
      [box.x + box.width + PAN_MARGIN, box.y + box.height + PAN_MARGIN],
    ],
  }
}

/**
 * Keeps a viewport inside the limits: the zoom between the minimum and the maximum, and the view inside the pan extent.
 * When the extent is smaller than the map on an axis, the content is centered on that axis. React Flow applies the
 * same rule to the user's own panning, but not to `setViewport`, so every move the app makes goes through here.
 */
export function clampViewport(viewport: Viewport, limits: Pick<Limits, 'minZoom' | 'maxZoom' | 'extent'>, map: Size): Viewport {
  const zoom = Math.min(limits.maxZoom, Math.max(limits.minZoom, viewport.zoom))
  const [[x0, y0], [x1, y1]] = limits.extent
  const axis = (offset: number, low: number, high: number, length: number) => {
    // How far the two edges of the map reach past the two ends of the extent, in board units.
    const before = -offset / zoom - low
    const after = (length - offset) / zoom - high
    const shift = after > before ? (before + after) / 2 : Math.min(0, before) || Math.max(0, after)
    return offset + shift * zoom
  }
  return { x: axis(viewport.x, x0, x1, map.width), y: axis(viewport.y, y0, y1, map.height), zoom }
}

export interface Frame {
  /** The rectangles to frame. The whole content when it is left out. */
  box?: Rect
  padding?: number
  maxZoom?: number
  /** Whole-board framing only: when the board would need less than a readable zoom, show the start of the flow instead. */
  readable?: boolean
  /** The cards where the flow starts: the first column on the left. Shown when the whole board is not readable. */
  start?: Rect
}

/** The room at the top of the map that notices cover. */
export function coveredTop(map: HTMLElement): number {
  const box = map.getBoundingClientRect()
  let top = 0
  for (const el of document.querySelectorAll('[data-notices] > *')) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && r.bottom > box.top) top = Math.max(top, r.bottom - box.top + 8)
  }
  return top
}

/**
 * The viewport that frames a box in the part of the map that notices and the zoom bar leave free.
 * Content smaller than the map is centered and never shown larger than `maxZoom`.
 */
export function frameViewport(limits: Limits, map: Size & { top: number }, options: Frame = {}): Viewport {
  const { box = limits.bounds, padding = 0, maxZoom = FIT_MAX_ZOOM, readable = false, start } = options
  const room = Math.max(120, map.height - map.top - CORNER_ROOM)
  const area = { width: map.width, height: room }
  const inflated = { x: box.x - box.width * padding, y: box.y - box.height * padding, width: box.width * (1 + padding * 2), height: box.height * (1 + padding * 2) }
  let zoom = Math.min(maxZoom, fitZoomFor(inflated, area))
  zoom = Math.min(limits.maxZoom, Math.max(limits.minZoom, zoom))
  if (readable && zoom < READABLE_ZOOM) {
    zoom = Math.max(limits.minZoom, START_ZOOM)
    // The left edge of the board, with the first column of cards in the middle of the height, or its top when taller.
    const first = start ?? box
    const middle = map.top + (room - first.height * zoom) / 2 - first.y * zoom
    const y = first.height * zoom > room - EDGE_ROOM * 2 ? map.top + EDGE_ROOM - first.y * zoom : middle
    return clampViewport({ x: EDGE_ROOM - box.x * zoom, y, zoom }, limits, map)
  }
  const x = (area.width - inflated.width * zoom) / 2 - inflated.x * zoom
  const y = map.top + (area.height - inflated.height * zoom) / 2 - inflated.y * zoom
  return clampViewport({ x, y, zoom }, limits, map)
}

/** The next zoom step up or down from the current zoom, within the limits. */
export function stepZoom(zoom: number, direction: 1 | -1, limits: Pick<Limits, 'minZoom' | 'maxZoom'>): number {
  const steps = [...new Set([...ZOOM_STEPS, limits.minZoom, limits.maxZoom])].filter((z) => z >= limits.minZoom - 1e-6 && z <= limits.maxZoom + 1e-6).sort((a, b) => a - b)
  const next = direction > 0 ? steps.find((z) => z > zoom * 1.01) : [...steps].reverse().find((z) => z < zoom / 1.01)
  return next ?? (direction > 0 ? limits.maxZoom : limits.minZoom)
}

/** The viewport after zooming to a level around a point of the map, such as its middle or the pointer. */
export function zoomAround(viewport: Viewport, zoom: number, point: { x: number; y: number }): Viewport {
  const ratio = zoom / viewport.zoom
  return { x: point.x - (point.x - viewport.x) * ratio, y: point.y - (point.y - viewport.y) * ratio, zoom }
}

/** Space kept between a card that was brought back into view and the edge of the map. */
const DROP_ROOM = 16

/**
 * A card dropped where it cannot be seen, such as under the inspector or past the edge of the map, is panned back.
 * The card's middle must be inside the free area to leave it alone. Otherwise the view moves just far enough
 * to show the whole card, and no further. Returns the new viewport, or undefined when the card is in view.
 */
export function viewportShowing(viewport: Viewport, map: Size & { top: number }, card: Rect): Viewport | undefined {
  const { x, y, zoom } = viewport
  const left = card.x * zoom + x
  const top = card.y * zoom + y
  const right = left + card.width * zoom
  const bottom = top + card.height * zoom
  const middleX = (left + right) / 2
  const middleY = (top + bottom) / 2
  if (middleX >= 0 && middleX <= map.width && middleY >= map.top && middleY <= map.height) return undefined
  const shift = (low: number, high: number, min: number, max: number) => {
    if (high - low > max - min || low < min) return min - low
    return high > max ? max - high : 0
  }
  const dx = shift(left, right, DROP_ROOM, map.width - DROP_ROOM)
  const dy = shift(top, bottom, map.top + DROP_ROOM, map.height - DROP_ROOM)
  if (dx === 0 && dy === 0) return undefined
  return { x: x + dx, y: y + dy, zoom }
}

/** Space kept between a part chosen in the sidebar or the command menu and the edge of the map. */
export const SELECT_ROOM = 80
/** A card narrower than this on screen is too small to read. */
export const LEGIBLE_WIDTH = 120
/** The zoom a part that is too small to read is shown at, at least. */
export const LEGIBLE_ZOOM = 0.8

/**
 * Where the camera goes to show a part that was chosen away from the map. The part ends at least `SELECT_ROOM` from
 * the edges of the map, never flush against one. When it is smaller than `LEGIBLE_WIDTH` on screen, or the screen is
 * narrow, the zoom is raised to `LEGIBLE_ZOOM` and the part is centered. Returns undefined when nothing needs to move.
 */
export function viewportFor(viewport: Viewport, map: Size & { top: number }, card: Rect, narrow = false): Viewport | undefined {
  const { x, y } = viewport
  const small = card.width * viewport.zoom < LEGIBLE_WIDTH
  const zoom = narrow || small ? Math.max(viewport.zoom, LEGIBLE_ZOOM) : viewport.zoom
  if (zoom !== viewport.zoom) {
    const room = map.height - map.top
    return { x: map.width / 2 - (card.x + card.width / 2) * zoom, y: map.top + room / 2 - (card.y + card.height / 2) * zoom, zoom }
  }
  const left = card.x * zoom + x
  const top = card.y * zoom + y
  const right = left + card.width * zoom
  const bottom = top + card.height * zoom
  // Too big for the room: its middle goes to the middle. Otherwise it moves just far enough.
  const shift = (low: number, high: number, min: number, max: number) => {
    if (high - low > max - min) return (min + max) / 2 - (low + high) / 2
    if (low < min) return min - low
    return high > max ? max - high : 0
  }
  const dx = shift(left, right, SELECT_ROOM, map.width - SELECT_ROOM)
  const dy = shift(top, bottom, map.top + SELECT_ROOM, map.height - SELECT_ROOM)
  if (dx === 0 && dy === 0) return undefined
  return { x: x + dx, y: y + dy, zoom }
}

/** Moves the camera, always inside the limits. Returns where it goes. */
export function moveCamera(flow: ReactFlowInstance, viewport: Viewport, limits: Limits, map: Size, duration = 0): Viewport {
  const next = clampViewport(viewport, limits, map)
  void flow.setViewport(next, { duration })
  return next
}
