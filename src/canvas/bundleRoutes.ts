import type { Board } from '../board/schema'
import { groupAreas } from '../layout/cards'
import type { Point, Rect } from '../layout/geometry'
import { clusterOf, type Pair } from './bundles'
import { Drawn, Obstacles, planEdges, routeConnection, type EdgeEnds } from './routing'

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

export const BUNDLE_MIN_WIDTH = 1.5
export const BUNDLE_MAX_WIDTH = 6

export function bundleWidth(count: number): number {
  return Math.min(BUNDLE_MAX_WIDTH, BUNDLE_MIN_WIDTH + Math.log2(Math.max(1, count)))
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
export const NAME_ROOM = 120
const NAME_SHARE = 0.45

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

/**
 * The second step of bundling, after `bundleGroups`: one orthogonal line for each pair of blocks, drawn in the gaps
 * between them with the router of the map: the blocks are what the lines keep out of. Pairs go shortest first, then by
 * name, so the picture is the same from one build to the next.
 */
export function computeBundles(board: Board, rects: Readonly<Record<string, Rect>>, counted: readonly Pair[]): Bundle[] {
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
    const route = routeConnection(plan, all, drawn, obstacles)
    if (route.runs) drawn.add(route.runs)
    const grow = (q: Point): Point => ({ x: q.x * ROUTE_SHRINK, y: q.y * ROUTE_SHRINK })
    const runs = route.runs?.map(([q, r]) => [grow(q), grow(r)] as [Point, Point])
    const points = runs && runs.length > 0 ? [(runs[0] as [Point, Point])[0], ...runs.map((r) => r[1])] : route.points.map(grow)
    out.set(id, { ...p, id, d: roundedPath(points), points, width: bundleWidth(p.count), arrow: arrowOf(p, points) })
  }
  return pairs.flatMap((p) => out.get(`${p.a}|${p.b}`) ?? [])
}
