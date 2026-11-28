import type { CoordinateExtent, ReactFlowInstance, Viewport } from '@xyflow/react'
import type { Rect } from '../layout/geometry'
import type { Mark, Proposal } from '../layer/model'
import { FAR_ENTER, FAR_EXIT } from './far'

/** The closest the map can zoom in. */
export const MAX_ZOOM = 2
/** Fitting never enlarges a small board past its real size. */
export const FIT_MAX_ZOOM = 1
/** Room around the content when it is fitted, in screen pixels. */
const FIT_ROOM = 32
/** How far past the content the map can be panned, in board pixels. */
export const PAN_MARGIN = 320
/** Keeps the zoom bar off the bottom row of cards when no taller overlay is measured. */
const CORNER_ROOM = 48
/** Room between the top of the map and a framed box when a floor zoom is hit. */
const EDGE_ROOM = 24
/** The zoom steps of the zoom buttons and keys. */
export const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2] as const

export interface Size {
  width: number
  height: number
}

/** A map size with the room reserved at its top and bottom for overlays (notices, toolbars, hint). */
export interface MapArea extends Size {
  top?: number
  bottom?: number
}

/** How far the map can zoom and pan, worked out from what is on it and the size of the map. */
export interface Limits {
  minZoom: number
  maxZoom: number
  /** The zoom that shows all the content. */
  fitZoom: number
  extent: CoordinateExtent
  /** Everything on the map: cards, group areas, marks, proposed parts, and, when the fit lands in the far view, the lines of the far view. */
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

/** Everything on the map, as one box: cards, group areas, marks, proposed parts, and the routes of the far-view lines when given. */
export function contentBounds(
  cards: readonly Rect[],
  groups: readonly Rect[] = [],
  marks: readonly Mark[] = [],
  proposals: readonly Proposal[] = [],
  routes: readonly Rect[] = [],
): Rect | undefined {
  const boxes: Rect[] = [...cards, ...groups, ...routes, ...proposals.map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height }))]
  for (const m of marks) {
    const box = markBox(m)
    if (box) boxes.push(box)
  }
  return union(boxes)
}

/**
 * The box a fit frames. When the cards alone fit near the far view, the lines of the far view count too, because they
 * route around the outside of the cards. They join the box only when that puts the fit in the far view, where they are
 * drawn. `routes` is asked only then, so a map that fits well in the near view never solves them.
 */
export function fitBounds(base: Rect | undefined, routes: () => Rect | undefined, map: MapArea): Rect | undefined {
  if (!base || !mayReachFar(base, map)) return base
  const area = fitArea(map)
  const lines = routes()
  const all = lines ? union([base, lines]) : undefined
  return all && fitZoomFor(all, area) < FAR_ENTER ? all : base
}

function fitArea(map: MapArea): Size {
  const top = map.top ?? 0
  const bottom = map.bottom ?? CORNER_ROOM
  return { width: map.width, height: Math.max(120, map.height - top - bottom) }
}

/** Whether a fit of the cards alone lands near enough to the far view that its lines could matter. */
export function mayReachFar(base: Rect | undefined, map: MapArea): boolean {
  return base !== undefined && map.width > 0 && map.height > 0 && fitZoomFor(base, fitArea(map)) < FAR_EXIT
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
export function zoomLimits(bounds: Rect | undefined, map: MapArea): Limits {
  const box = bounds ?? { x: 0, y: 0, width: 1, height: 1 }
  // The zoom bar and any bottom overlays take the bottom strip, so the fit leaves room for them.
  const fitZoom = map.width > 0 && map.height > 0 ? fitZoomFor(box, fitArea(map)) : 1
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
export function clampViewport(viewport: Viewport, limits: Pick<Limits, 'minZoom' | 'maxZoom' | 'extent'>, map: MapArea): Viewport {
  const zoom = Math.min(limits.maxZoom, Math.max(limits.minZoom, viewport.zoom))
  const [[x0, y0], [x1, y1]] = limits.extent
  const axis = (offset: number, low: number, high: number, start: number, end: number) => {
    // How far the two edges of the free area reach past the two ends of the extent, in board units.
    const before = (start - offset) / zoom - low
    const after = (end - offset) / zoom - high
    const shift = after > before ? (before + after) / 2 : Math.min(0, before) || Math.max(0, after)
    return offset + shift * zoom
  }
  const top = map.top ?? 0
  const bottom = map.bottom ?? 0
  return { x: axis(viewport.x, x0, x1, 0, map.width), y: axis(viewport.y, y0, y1, top, Math.max(top + 1, map.height - bottom)), zoom }
}

/**
 * Whether a box of the board lies wholly inside the free area of the map at this viewport: below the notices and above
 * the bottom controls, with no room to spare. A card half cut off, or under a control, is out of view. A walkthrough
 * step whose targets are already in view leaves the camera where it is.
 */
export function boxInView(viewport: Viewport, map: Size & { top: number; bottom?: number }, box: Rect): boolean {
  const left = box.x * viewport.zoom + viewport.x
  const top = box.y * viewport.zoom + viewport.y
  const right = left + box.width * viewport.zoom
  const bottom = top + box.height * viewport.zoom
  return (
    left >= -0.5 &&
    right <= map.width + 0.5 &&
    top >= map.top - 0.5 &&
    bottom <= map.height - (map.bottom ?? 0) + 0.5
  )
}

export interface Frame {
  /** The rectangles to frame. The whole content when it is left out. */
  box?: Rect
  padding?: number
  maxZoom?: number
  /** Whole-board opening frame: fits the parts box centered in the free area (D141). */
  readable?: boolean
  /** Never frame below this zoom: a box too big for it shows its top left corner, so text stays readable. */
  floorZoom?: number
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

/** The room a toast takes above the bottom controls: the same as the first-run hint, one line of it and its 8 px gap. */
export const TOAST_ROOM = 46

/** The room at the bottom of the map that the toolbars cover. A toast sits right above it. */
function toolbarRoom(map: HTMLElement): number {
  const box = map.getBoundingClientRect()
  let bottom = CORNER_ROOM
  for (const el of map.querySelectorAll('[role="toolbar"]')) {
    if (el.closest('.react-flow__viewport')) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && r.top < box.bottom) bottom = Math.max(bottom, box.bottom - r.top + 8)
  }
  return bottom
}

/**
 * The room at the bottom of the map that floating controls (toolbars, hint, detail notice) cover, and the toast slot above the
 * toolbars. The slot is where the first-run hint sits, so a fit leaves the same room with the hint and without it, and a toast
 * never lands on a card of a fitted view.
 */
export function coveredBottom(map: HTMLElement): number {
  const box = map.getBoundingClientRect()
  let bottom = toolbarRoom(map) + TOAST_ROOM
  for (const el of map.querySelectorAll('[role="note"], [data-testid="hidden-detail"]')) {
    if (el.closest('.react-flow__viewport')) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && r.top < box.bottom) {
      bottom = Math.max(bottom, box.bottom - r.top + 8)
    }
  }
  return bottom
}

/**
 * Where a toast goes: its bottom edge's distance from the bottom of the window, and the middle of the map across the window.
 * The toast sits in the slot above the toolbars, centered on the map, which the sidebar makes off-center in the window.
 */
export function toastPlace(map: HTMLElement): { bottom: number; center: number } {
  const box = map.getBoundingClientRect()
  return { bottom: Math.max(0, window.innerHeight - box.bottom) + toolbarRoom(map), center: (box.left + box.right) / 2 }
}

/**
 * The viewport that frames a box in the part of the map that notices and bottom controls leave free.
 * Content smaller than the map is centered and never shown larger than `maxZoom`.
 */
export function frameViewport(limits: Limits, map: Size & { top: number; bottom?: number }, options: Frame = {}): Viewport {
  const { box = limits.bounds, padding = 0, maxZoom = FIT_MAX_ZOOM, floorZoom } = options
  const bottom = map.bottom ?? CORNER_ROOM
  const room = Math.max(120, map.height - map.top - bottom)
  const area = { width: map.width, height: room }
  const inflated = { x: box.x - box.width * padding, y: box.y - box.height * padding, width: box.width * (1 + padding * 2), height: box.height * (1 + padding * 2) }
  let zoom = Math.min(maxZoom, fitZoomFor(inflated, area))
  zoom = Math.min(limits.maxZoom, Math.max(limits.minZoom, zoom))
  if (floorZoom !== undefined && zoom < floorZoom) {
    zoom = Math.min(limits.maxZoom, Math.max(limits.minZoom, floorZoom))
    return clampViewport({ x: EDGE_ROOM - inflated.x * zoom, y: map.top + EDGE_ROOM - inflated.y * zoom, zoom }, limits, map)
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
