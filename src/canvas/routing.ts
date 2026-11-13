import { CARD_HEIGHT, CARD_WIDTH } from '../overlay/layout'
import type { Point } from '../overlay/types'

export type Side = 'left' | 'right' | 'top' | 'bottom'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A drawn connection: the SVG path, and points along it for placing the label. */
export interface Route {
  d: string
  points: Point[]
  /** The straight runs of a routed path. Later connections keep off them. */
  runs?: [Point, Point][]
}

export interface Plan {
  out: Side
  in: Side
  a: Point
  b: Point
  /** Pushes the middle of the curve sideways, so connections between the same two cards do not run together. */
  bend?: Point
}

const NORMAL: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
}

/** Which sides of the two cards a connection leaves from and arrives at. */
export function pickSides(from: Point, to: Point): { out: Side; in: Side } {
  if (to.x >= from.x + CARD_WIDTH) return { out: 'right', in: 'left' }
  if (to.x + CARD_WIDTH <= from.x) return { out: 'left', in: 'right' }
  return to.y >= from.y ? { out: 'bottom', in: 'top' } : { out: 'top', in: 'bottom' }
}

const SPREAD = 28
/** How far apart, across the middle, connections between the same two cards are drawn. */
const BUNDLE_GAP = 46

function sideMiddle(p: Point, side: Side): Point {
  if (side === 'left') return { x: p.x, y: p.y + CARD_HEIGHT / 2 }
  if (side === 'right') return { x: p.x + CARD_WIDTH, y: p.y + CARD_HEIGHT / 2 }
  if (side === 'top') return { x: p.x + CARD_WIDTH / 2, y: p.y }
  return { x: p.x + CARD_WIDTH / 2, y: p.y + CARD_HEIGHT }
}

export interface EdgeEnds {
  id: string
  from: string
  to: string
}

/**
 * Chooses the sides and the exact meeting points for every connection.
 * Connections that share a side of a card spread out along it, ordered by where
 * the other end is, so two connections between the same pair run side by side.
 */
export function planEdges(positions: Readonly<Record<string, Point>>, edges: readonly EdgeEnds[]): Map<string, Plan> {
  type Use = { edge: string; end: 'a' | 'b'; across: number }
  const uses = new Map<string, Use[]>()
  const plans = new Map<string, Plan>()
  const centerOf = (p: Point): Point => ({ x: p.x + CARD_WIDTH / 2, y: p.y + CARD_HEIGHT / 2 })
  const add = (card: string, side: Side, use: Use) => {
    const key = `${card}|${side}`
    const list = uses.get(key)
    if (list) list.push(use)
    else uses.set(key, [use])
  }

  for (const e of edges) {
    const from = positions[e.from]
    const to = positions[e.to]
    if (!from || !to) continue
    const sides = pickSides(from, to)
    plans.set(e.id, { out: sides.out, in: sides.in, a: sideMiddle(from, sides.out), b: sideMiddle(to, sides.in) })
    const vertical = (s: Side) => s === 'left' || s === 'right'
    const fromC = centerOf(from)
    const toC = centerOf(to)
    add(e.from, sides.out, { edge: e.id, end: 'a', across: vertical(sides.out) ? toC.y : toC.x })
    add(e.to, sides.in, { edge: e.id, end: 'b', across: vertical(sides.in) ? fromC.y : fromC.x })
  }

  for (const [key, list] of uses) {
    if (list.length < 2) continue
    const side = key.slice(key.lastIndexOf('|') + 1) as Side
    const along = side === 'left' || side === 'right' ? 'y' : 'x'
    const room = (side === 'left' || side === 'right' ? CARD_HEIGHT : CARD_WIDTH) - 44
    const gap = Math.min(SPREAD, room / (list.length - 1))
    list.sort((p, q) => p.across - q.across || (p.edge < q.edge ? -1 : 1))
    list.forEach((use, i) => {
      const plan = plans.get(use.edge)
      if (!plan) return
      const point = use.end === 'a' ? plan.a : plan.b
      point[along] += (i - (list.length - 1) / 2) * gap
    })
  }

  // Connections between the same two cards leave and arrive side by side, then bow apart in the middle.
  const pairs = new Map<string, string[]>()
  for (const e of edges) {
    if (!plans.has(e.id)) continue
    const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`
    const list = pairs.get(key)
    if (list) list.push(e.id)
    else pairs.set(key, [e.id])
  }
  for (const ids of pairs.values()) {
    if (ids.length < 2) continue
    // Same order as the meeting points along the card side (by ID), so the curves never cross.
    ids.sort()
    ids.forEach((id, i) => {
      const plan = plans.get(id)
      if (!plan) return
      const amount = (i - (ids.length - 1) / 2) * BUNDLE_GAP
      // Push across the line, towards the side where the meeting points of later IDs sit.
      const toward = plan.out === 'left' || plan.out === 'right' ? { x: 0, y: 1 } : { x: 1, y: 0 }
      const length = Math.hypot(plan.b.x - plan.a.x, plan.b.y - plan.a.y) || 1
      let normal = { x: -(plan.b.y - plan.a.y) / length, y: (plan.b.x - plan.a.x) / length }
      if (normal.x * toward.x + normal.y * toward.y < 0) normal = { x: -normal.x, y: -normal.y }
      plan.bend = { x: normal.x * amount, y: normal.y * amount }
    })
  }
  return plans
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** A cubic curve that leaves one side straight out and arrives at the other straight in. */
export function curve(a: Point, sideA: Side, b: Point, sideB: Side, bend: Point = { x: 0, y: 0 }): Route {
  const reach = Math.max(28, (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / 2)
  const na = NORMAL[sideA]
  const nb = NORMAL[sideB]
  // The curve peaks at three quarters of the control offset, so the push is scaled up to move the middle by `bend`.
  const c1 = { x: a.x + na.x * reach + bend.x * 1.33, y: a.y + na.y * reach + bend.y * 1.33 }
  const c2 = { x: b.x + nb.x * reach + bend.x * 1.33, y: b.y + nb.y * reach + bend.y * 1.33 }
  const points: Point[] = []
  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = lerp(lerp(lerp(a, c1, t), lerp(c1, c2, t), t), lerp(lerp(c1, c2, t), lerp(c2, b, t), t), t)
    points.push(p)
  }
  return { d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`, points }
}

function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 }
}

function inside(p: Point, r: Rect): boolean {
  return p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height
}

/** True when the straight run from p to q crosses the inside of the rectangle. */
function crosses(p: Point, q: Point, r: Rect): boolean {
  const minX = Math.min(p.x, q.x)
  const maxX = Math.max(p.x, q.x)
  const minY = Math.min(p.y, q.y)
  const maxY = Math.max(p.y, q.y)
  return maxX > r.x && minX < r.x + r.width && maxY > r.y && minY < r.y + r.height
}

export function hitsAnyCard(route: Route, cards: readonly Rect[]): boolean {
  const boxes = cards.map((c) => inflate(c, 4))
  return route.points.some((p) => boxes.some((b) => inside(p, b)))
}

const MARGIN = 16
const STUB = 22
const TURN_COST = 36
const RADIUS = 16
/** Extra cost per unit of a run that lies along a path already drawn, so connections spread over the gaps. */
const SHARE_COST = 2.5

function sharedLength(p: Point, q: Point, used: readonly (readonly [Point, Point])[]): number {
  let total = 0
  const horizontal = p.y === q.y
  for (const [u, v] of used) {
    if (horizontal) {
      if (u.y !== v.y || Math.abs(u.y - p.y) > 6) continue
      total += Math.max(0, Math.min(Math.max(p.x, q.x), Math.max(u.x, v.x)) - Math.max(Math.min(p.x, q.x), Math.min(u.x, v.x)))
    } else {
      if (u.x !== v.x || Math.abs(u.x - p.x) > 6) continue
      total += Math.max(0, Math.min(Math.max(p.y, q.y), Math.max(u.y, v.y)) - Math.max(Math.min(p.y, q.y), Math.min(u.y, v.y)))
    }
  }
  return total
}

function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const v of sorted) {
    const last = out[out.length - 1]
    if (last === undefined || v - last > 3) out.push(v)
  }
  return out
}

/** Lines worth running along: just off every card, and down the middle of each gap between cards. */
function lanes(edges: { lo: number; hi: number }[], extra: number[]): number[] {
  const values = [...extra]
  for (const e of edges) values.push(e.lo - MARGIN, e.hi + MARGIN)
  for (const p of edges) {
    for (const q of edges) {
      const gap = q.lo - p.hi
      if (gap > 2 * MARGIN && gap < 240) values.push((p.hi + q.lo) / 2)
    }
  }
  return uniqueSorted(values)
}

/**
 * Finds a path of straight runs that stays out of every card.
 * It searches the lines just off the cards and down the gaps, and charges for each turn.
 */
function findPath(start: Point, end: Point, cards: readonly Rect[], used: readonly (readonly [Point, Point])[]): Point[] | undefined {
  const boxes = cards.map((c) => inflate(c, MARGIN - 2))
  const xs = lanes(
    cards.map((c) => ({ lo: c.x, hi: c.x + c.width })),
    [start.x, end.x],
  )
  const ys = lanes(
    cards.map((c) => ({ lo: c.y, hi: c.y + c.height })),
    [start.y, end.y],
  )
  const width = xs.length
  const index = (i: number, j: number, d: number) => (j * width + i) * 4 + d
  const free = (p: Point) => !boxes.some((b) => inside(p, b))
  const clear = (p: Point, q: Point) => !boxes.some((b) => crosses(p, q, b))
  const DIRS = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ] as const

  const si = xs.findIndex((x) => Math.abs(x - start.x) <= 3)
  const sj = ys.findIndex((y) => Math.abs(y - start.y) <= 3)
  const ei = xs.findIndex((x) => Math.abs(x - end.x) <= 3)
  const ej = ys.findIndex((y) => Math.abs(y - end.y) <= 3)
  if (si < 0 || sj < 0 || ei < 0 || ej < 0) return undefined

  const best = new Map<number, number>()
  const from = new Map<number, number>()
  // A small binary heap of [cost, state].
  const heap: [number, number][] = []
  const push = (item: [number, number]) => {
    heap.push(item)
    let n = heap.length - 1
    while (n > 0) {
      const parent = (n - 1) >> 1
      if ((heap[parent] as [number, number])[0] <= (heap[n] as [number, number])[0]) break
      ;[heap[parent], heap[n]] = [heap[n] as [number, number], heap[parent] as [number, number]]
      n = parent
    }
  }
  const pop = (): [number, number] | undefined => {
    const top = heap[0]
    const last = heap.pop()
    if (top === undefined || last === undefined) return undefined
    if (heap.length > 0) {
      heap[0] = last
      let n = 0
      for (;;) {
        const l = n * 2 + 1
        const r = l + 1
        let m = n
        if (l < heap.length && (heap[l] as [number, number])[0] < (heap[m] as [number, number])[0]) m = l
        if (r < heap.length && (heap[r] as [number, number])[0] < (heap[m] as [number, number])[0]) m = r
        if (m === n) break
        ;[heap[m], heap[n]] = [heap[n] as [number, number], heap[m] as [number, number]]
        n = m
      }
    }
    return top
  }

  for (let d = 0; d < 4; d++) {
    best.set(index(si, sj, d), 0)
    push([0, index(si, sj, d)])
  }
  let goal = -1
  let guard = 0
  for (let item = pop(); item && guard < 200000; item = pop(), guard++) {
    const [cost, state] = item
    if (cost > (best.get(state) ?? Infinity)) continue
    const d = state % 4
    const cell = (state - d) / 4
    const i = cell % width
    const j = (cell - i) / width
    if (i === ei && j === ej) {
      goal = state
      break
    }
    for (let nd = 0; nd < 4; nd++) {
      const dir = DIRS[nd] as readonly [number, number]
      const ni = i + dir[0]
      const nj = j + dir[1]
      const nx = xs[ni]
      const ny = ys[nj]
      if (nx === undefined || ny === undefined) continue
      const here = { x: xs[i] as number, y: ys[j] as number }
      const there = { x: nx, y: ny }
      if (!free(there) || !clear(here, there)) continue
      if (nd !== d && nd === (d + 2) % 4) continue
      const length = Math.abs(nx - here.x) + Math.abs(ny - here.y)
      const next = cost + length + (nd === d ? 0 : TURN_COST) + sharedLength(here, there, used) * SHARE_COST
      const key = index(ni, nj, nd)
      if (next < (best.get(key) ?? Infinity)) {
        best.set(key, next)
        from.set(key, state)
        push([next, key])
      }
    }
  }
  if (goal < 0) return undefined

  const cells: Point[] = []
  for (let s: number | undefined = goal; s !== undefined; s = from.get(s)) {
    const cell = (s - (s % 4)) / 4
    const i = cell % width
    cells.push({ x: xs[i] as number, y: ys[(cell - i) / width] as number })
  }
  cells.reverse()
  // Keep only the corners.
  const corners: Point[] = []
  for (const p of cells) {
    const a = corners[corners.length - 2]
    const b = corners[corners.length - 1]
    if (b && b.x === p.x && b.y === p.y) continue
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) corners[corners.length - 1] = p
    else corners.push(p)
  }
  return corners
}

/** Turns corners into small curves and samples the result. */
function rounded(corners: readonly Point[]): Route {
  const runs: [Point, Point][] = []
  for (let k = 1; k < corners.length; k++) runs.push([corners[k - 1] as Point, corners[k] as Point])
  const first = corners[0] as Point
  let d = `M ${first.x} ${first.y}`
  const points: Point[] = [first]
  const sample = (p: Point, q: Point) => {
    const length = Math.hypot(q.x - p.x, q.y - p.y)
    const n = Math.max(1, Math.round(length / 8))
    for (let i = 1; i <= n; i++) points.push(lerp(p, q, i / n))
  }
  let at = first
  for (let k = 1; k < corners.length; k++) {
    const p = corners[k] as Point
    const next = corners[k + 1]
    if (!next) {
      d += ` L ${p.x} ${p.y}`
      sample(at, p)
      break
    }
    const inLen = Math.hypot(p.x - at.x, p.y - at.y)
    const outLen = Math.hypot(next.x - p.x, next.y - p.y)
    const r = Math.min(RADIUS, inLen / 2, outLen / 2)
    const before = lerp(p, at, r / inLen)
    const after = lerp(p, next, r / outLen)
    d += ` L ${before.x} ${before.y} Q ${p.x} ${p.y} ${after.x} ${after.y}`
    sample(at, before)
    sample(before, p)
    sample(p, after)
    at = after
  }
  return { d, points, runs }
}

/**
 * The line for one connection. It is a plain curve between the two cards.
 * If that curve would pass behind another card, it becomes a path with rounded corners
 * that runs through the gaps instead.
 */
export function routeConnection(
  plan: Plan,
  cards: readonly Rect[],
  ends: readonly [Rect, Rect],
  used: readonly (readonly [Point, Point])[] = [],
): Route {
  const direct = curve(plan.a, plan.out, plan.b, plan.in, plan.bend)
  const others = cards.filter((c) => c !== ends[0] && c !== ends[1])
  if (others.length === 0 || !hitsAnyCard(direct, others)) return direct
  const n1 = NORMAL[plan.out]
  const n2 = NORMAL[plan.in]
  const start = { x: plan.a.x + n1.x * STUB, y: plan.a.y + n1.y * STUB }
  const end = { x: plan.b.x + n2.x * STUB, y: plan.b.y + n2.y * STUB }
  const middle = findPath(start, end, cards, used)
  if (!middle) return direct
  return rounded([plan.a, start, ...middle.slice(1, -1), end, plan.b])
}
