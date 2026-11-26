import type { Board } from '../board/schema'
import { groupAreas } from '../layout/cards'
import type { Point, Rect } from '../layout/geometry'
import { clusterOf, type Pair } from './bundles'
import { Drawn, Obstacles, planEdges, planThrough, routeConnectionSteps, type EdgeEnds, type Plan, type Route, type Side } from './routing'

export interface Bundle extends Pair {
  id: string
  /** The drawn line, orthogonal, between the two blocks. */
  d: string
  /** The corners of the line, from `a` to `b`. */
  points: Point[]
  /** Stroke width on screen. It grows gently with the count, up to a cap. */
  width: number
  /** Where an arrowhead goes and which way it points, when every connection of the pair runs one way. */
  arrow?: { at: Point; angle: number } | undefined
}

export const BUNDLE_MIN_WIDTH = 1.25
export const BUNDLE_MAX_WIDTH = 2.5

export function bundleWidth(count: number): number {
  // One or two connections draw at the minimum. Each doubling after that adds half a pixel.
  return Math.min(BUNDLE_MAX_WIDTH, BUNDLE_MIN_WIDTH + 0.5 * Math.log2(Math.max(1, count / 2)))
}

/** The blocks the bundles join: each group area, each part that has no group, and each proposed part. Solved once per layout. */
export function blocksOf(board: Board, rects: Readonly<Record<string, Rect>>): Map<string, Rect> {
  const blocks = new Map<string, Rect>()
  for (const [id, area] of Object.entries(groupAreas(board, rects))) blocks.set(`group:${id}`, area)
  const clusters = clusterOf(board)
  for (const [id, rect] of Object.entries(rects)) if (!clusters.get(id)?.startsWith('group:')) blocks.set(id, rect)
  return blocks
}

/**
 * The router keeps lines 14px from a card, 20px clear at its ends, and 16px apart, all in board pixels. In the far view a
 * board pixel is a fraction of a screen pixel, so the blocks are routed at this fraction of their size, and the room
 * the router keeps grows to match. The lines are scaled back after.
 */
export const ROUTE_SHRINK = 3

/** How high above a group, in board pixels, and how far along its top edge, its name takes room. */
export const NAME_ROOM = 150
const NAME_SHARE = 0.9

/** The corner radius of a bundled line, in board pixels. */
const CORNER = 28

/** A path through these points with rounded corners. */
export function roundedPath(points: readonly Point[], radius = CORNER): string {
  const first = points[0]
  if (!first) return ''
  let d = `M${first.x} ${first.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1] as Point
    const c = points[i] as Point
    const n = points[i + 1] as Point
    const before = Math.hypot(c.x - p.x, c.y - p.y)
    const after = Math.hypot(n.x - c.x, n.y - c.y)
    const r = Math.min(radius, before / 2, after / 2)
    if (r <= 0) continue
    const a = { x: c.x + ((p.x - c.x) / before) * r, y: c.y + ((p.y - c.y) / before) * r }
    const b = { x: c.x + ((n.x - c.x) / after) * r, y: c.y + ((n.y - c.y) / after) * r }
    d += ` L${a.x} ${a.y} Q${c.x} ${c.y} ${b.x} ${b.y}`
  }
  const last = points[points.length - 1] as Point
  return `${d} L${last.x} ${last.y}`
}

/** The arrowhead of a pair whose connections all run one way: at the end they run to, pointing along the last run. */
export function arrowOf(pair: Pick<Pair, 'ab' | 'ba'>, points: readonly Point[]): Bundle['arrow'] {
  if (points.length < 2 || (pair.ab > 0 && pair.ba > 0)) return undefined
  const forward = pair.ab > 0
  const tip = forward ? (points[points.length - 1] as Point) : (points[0] as Point)
  const from = forward ? (points[points.length - 2] as Point) : (points[1] as Point)
  return { at: tip, angle: (Math.atan2(tip.y - from.y, tip.x - from.x) * 180) / Math.PI }
}

/** The middle of the longest straight run of a line: where a tag goes when no count was placed. */
export function middleOf(points: readonly Point[]): Point {
  let best: { p: Point; q: Point; length: number } | undefined
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1] as Point
    const q = points[i] as Point
    const length = Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
    if (!best || length > best.length) best = { p, q, length }
  }
  return best ? { x: (best.p.x + best.q.x) / 2, y: (best.p.y + best.q.y) / 2 } : (points[0] ?? { x: 0, y: 0 })
}

/** The line as it is drawn: the corners of `roundedPath` sampled along their curves, so a distance is measured to the ink and not to a corner that was cut. */
export function drawnPoints(points: readonly Point[], radius = CORNER): Point[] {
  const out: Point[] = []
  const first = points[0]
  if (!first) return out
  out.push(first)
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1] as Point
    const c = points[i] as Point
    const n = points[i + 1] as Point
    const before = Math.hypot(c.x - p.x, c.y - p.y)
    const after = Math.hypot(n.x - c.x, n.y - c.y)
    const r = Math.min(radius, before / 2, after / 2)
    if (r <= 0) continue
    const a = { x: c.x + ((p.x - c.x) / before) * r, y: c.y + ((p.y - c.y) / before) * r }
    const b = { x: c.x + ((n.x - c.x) / after) * r, y: c.y + ((n.y - c.y) / after) * r }
    for (let k = 0; k <= 8; k++) {
      const t = k / 8
      out.push({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y })
    }
  }
  out.push(points[points.length - 1] as Point)
  return out
}

/** The distance from a point to a straight run. */
function distanceToRun(at: Point, p: Point, q: Point): number {
  const dx = q.x - p.x
  const dy = q.y - p.y
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((at.x - p.x) * dx + (at.y - p.y) * dy) / length))
  return Math.hypot(at.x - (p.x + t * dx), at.y - (p.y + t * dy))
}

/**
 * The bundle whose line lies nearest a point, within `reach`, or undefined. Where lines lie closer together than a
 * finger is wide, their touch targets overlap and the browser gives a touch to whichever is drawn last, so a tap is
 * resolved by distance instead: it always picks the line the finger is closest to. Ties go to the earlier bundle.
 */
export function nearestBundle(bundles: readonly Pick<Bundle, 'id' | 'points'>[], at: Point, reach: number): string | undefined {
  let best: { id: string; distance: number } | undefined
  for (const b of bundles) {
    const drawn = drawnPoints(b.points)
    for (let i = 1; i < drawn.length; i++) {
      const d = distanceToRun(at, drawn[i - 1] as Point, drawn[i] as Point)
      if (d <= reach && (!best || d < best.distance)) best = { id: b.id, distance: d }
    }
  }
  return best?.id
}

/** Arrowheads closer than this on screen, at the same side of the same block, read as a ladder. */
export const ARROW_GAP_PX = 6

/**
 * The bundles whose arrowhead is drawn at this scale of the label (the board pixels one screen pixel takes). Where several
 * bundles arrive at the same side of the same block and their heads would sit closer than `ARROW_GAP_PX` on screen,
 * only the first of each run keeps its head, from the top or left; the others show their line and count without a
 * direction. A bundle that is yours keeps its head. The result is worked out once per layout and per scale, not per frame.
 */
export function visibleArrows(bundles: readonly Bundle[], pixel: number): Set<string> {
  const gap = ARROW_GAP_PX * pixel
  const sides = new Map<string, { id: string; along: number; mine: boolean }[]>()
  const shown = new Set<string>()
  for (const b of bundles) {
    if (!b.arrow) continue
    const horizontal = Math.abs(Math.cos((b.arrow.angle * Math.PI) / 180)) > 0.5
    const block = b.ab > 0 ? b.b : b.a
    const key = `${block}:${Math.round(b.arrow.angle / 90) % 4}`
    const list = sides.get(key) ?? []
    list.push({ id: b.id, along: horizontal ? b.arrow.at.y : b.arrow.at.x, mine: Boolean(b.mine) })
    sides.set(key, list)
  }
  for (const list of sides.values()) {
    list.sort((p, q) => p.along - q.along)
    let last = -Infinity
    for (const item of list) {
      if (item.mine || item.along - last >= gap) {
        shown.add(item.id)
        last = item.along
      }
    }
  }
  return shown
}

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

/** True when a straight run passes through the inside of the rectangle. */
const runsThrough = (p: Point, q: Point, r: Rect): boolean =>
  Math.max(p.x, q.x) > r.x && Math.min(p.x, q.x) < r.x + r.width && Math.max(p.y, q.y) > r.y && Math.min(p.y, q.y) < r.y + r.height

/** Whether a route passes through the inside of any of the rectangles. */
function crossesAny(route: Route, rects: readonly Rect[]): boolean {
  const runs = route.runs ?? route.points.slice(1).map((q, i) => [route.points[i] as Point, q] as [Point, Point])
  return runs.some(([p, q]) => rects.some((r) => runsThrough(p, q, r)))
}

/**
 * The side pairs a connection may use, the planned one first, then the others with the shortest reach first. A pair
 * the planner chose is only a preference: when the room in front of that side is shut, another side may be open.
 */
function alternatives(plan: Plan, from: Rect, to: Rect): Plan[] {
  const others: Plan[] = []
  for (const out of SIDES)
    for (const into of SIDES) {
      if (out === plan.out && into === plan.in) continue
      others.push(planThrough(from, to, out, into))
    }
  const reach = (q: Plan) => Math.abs(q.a.x - q.b.x) + Math.abs(q.a.y - q.b.y)
  return [plan, ...others.sort((p, q) => reach(p) - reach(q))]
}

/**
 * The second step of bundling, after `bundleGroups`: one orthogonal line for each pair of blocks, drawn in the gaps
 * between them with the router of the map: the blocks are what the lines keep out of. Pairs go shortest first, then by
 * name, so the picture is the same from one build to the next. It gives the way back to the caller during each search, so
 * a caller that works in slices of a frame can stop between them; `computeBundles` runs every step.
 */
export function* bundleSteps(board: Board, rects: Readonly<Record<string, Rect>>, counted: readonly Pair[]): Generator<void, Bundle[], void> {
  const blocks = blocksOf(board, rects)
  const pairs = counted.filter((p) => blocks.has(p.a) && blocks.has(p.b))
  const ends: EdgeEnds[] = pairs.map((p) => ({ id: `${p.a}|${p.b}`, from: p.a, to: p.b }))
  const rectOf = Object.fromEntries([...blocks].map(([id, r]) => [id, { x: r.x / ROUTE_SHRINK, y: r.y / ROUTE_SHRINK, width: r.width / ROUTE_SHRINK, height: r.height / ROUTE_SHRINK }]))
  const plans = planEdges(rectOf, ends)
  // The name of a group is drawn above its top edge. The lines keep out of the room it takes.
  const names = [...blocks]
    .filter(([id]) => id.startsWith('group:'))
    .map(([, r]) => ({ x: r.x / ROUTE_SHRINK, y: (r.y - NAME_ROOM) / ROUTE_SHRINK, width: (r.width * NAME_SHARE) / ROUTE_SHRINK, height: NAME_ROOM / ROUTE_SHRINK }))
  const all = [...Object.values(rectOf), ...names]
  const obstacles = new Obstacles(all)
  const blocksOnly = new Obstacles(Object.values(rectOf))
  const drawn = new Drawn()
  const reach = (p: Pair) => {
    const plan = plans.get(`${p.a}|${p.b}`)
    return plan ? Math.abs(plan.a.x - plan.b.x) + Math.abs(plan.a.y - plan.b.y) : Infinity
  }
  const order = [...pairs].sort((p, q) => reach(p) - reach(q))
  const out = new Map<string, Bundle>()
  for (const p of order) {
    const id = `${p.a}|${p.b}`
    const plan = plans.get(id)
    if (!plan) continue
    // Keep out of every block the pair does not join. The planned sides come first. When they leave no way through, the
    // other sides are tried, and then the same again with the room taken by the group names left free.
    const keepOut = Object.entries(rectOf).filter(([k]) => k !== p.a && k !== p.b).map(([, r]) => r)
    let route = yield* routeConnectionSteps(plan, all, drawn, obstacles)
    yield
    if (crossesAny(route, keepOut)) {
      const from = rectOf[p.a] as Rect
      const to = rectOf[p.b] as Rect
      const tries = [
        ...alternatives(plan, from, to).map((q) => ({ q, cards: all, grid: obstacles })),
        ...alternatives(plan, from, to).map((q) => ({ q, cards: blocksOnly.cards, grid: blocksOnly })),
      ]
      let clear: Route | undefined
      for (const t of tries) {
        const attempt = yield* routeConnectionSteps(t.q, t.cards, drawn, t.grid)
        yield
        if (!crossesAny(attempt, keepOut)) {
          clear = attempt
          break
        }
      }
      if (clear) route = clear
    }
    if (route.runs) drawn.add(route.runs)
    const grow = (q: Point): Point => ({ x: q.x * ROUTE_SHRINK, y: q.y * ROUTE_SHRINK })
    const runs = route.runs?.map(([q, r]) => [grow(q), grow(r)] as [Point, Point])
    const points = runs && runs.length > 0 ? [(runs[0] as [Point, Point])[0], ...runs.map((r) => r[1])] : route.points.map(grow)
    out.set(id, { ...p, id, d: roundedPath(points), points, width: bundleWidth(p.count), arrow: arrowOf(p, points) })
  }
  return pairs.flatMap((p) => out.get(`${p.a}|${p.b}`) ?? [])
}

/** The lines of every pair, in one go. */
export function computeBundles(board: Board, rects: Readonly<Record<string, Rect>>, counted: readonly Pair[]): Bundle[] {
  const steps = bundleSteps(board, rects, counted)
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
  }
}

type Kept = { board: Board; rects: Readonly<Record<string, Rect>>; key: string; bundles: Bundle[] }

/**
 * The two answers asked for most recently. Two, because the build after a resize prepares the lines of the new layout
 * while the lines of the layout still on screen can be asked for again (a zoom in and out before the build ends).
 */
let kept: Kept[] = []

/** The kept answer for this layout, moved to the front so that the next answer to be kept evicts the other one. */
function find(board: Board, rects: Readonly<Record<string, Rect>>, key: string): Kept | undefined {
  const hit = kept.find((k) => k.board === board && k.rects === rects && k.key === key)
  if (hit && hit !== kept[0]) kept = [hit, ...kept.filter((k) => k !== hit)]
  return hit
}

function keep(entry: Kept): void {
  kept = [entry, ...kept].slice(0, 2)
}

/**
 * `computeBundles` for the layouts on the map. The fit and the far layer ask for the same lines, so an answer
 * is kept for as long as the board, the cards, and the pairs are the same.
 */
export function sharedBundles(board: Board, rects: Readonly<Record<string, Rect>>, counted: readonly Pair[]): Bundle[] {
  const key = JSON.stringify(counted)
  const hit = find(board, rects, key)
  if (hit) return hit.bundles
  const bundles = computeBundles(board, rects, counted)
  keep({ board, rects, key, bundles })
  return bundles
}

/**
 * Solves the lines `sharedBundles` will be asked for, in steps, so a build that works in slices of a frame has them ready
 * and the commit that follows it solves nothing. It does nothing when they are already kept.
 */
export function* primeBundles(board: Board, rects: Readonly<Record<string, Rect>>, counted: readonly Pair[]): Generator<void, void, void> {
  const key = JSON.stringify(counted)
  if (find(board, rects, key)) return
  const bundles = yield* bundleSteps(board, rects, counted)
  keep({ board, rects, key, bundles })
}
