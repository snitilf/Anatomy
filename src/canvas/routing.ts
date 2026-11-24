import { center, contains as inside, inflate, type Point, type Rect } from '../layout/geometry'
import { groupBand, groupTitle } from './bands'

export type { Rect }
export type Side = 'left' | 'right' | 'top' | 'bottom'

/** A drawn connection: the SVG path, and points along it for placing the label. */
export interface Route {
  d: string
  points: Point[]
  /** The straight runs of a routed path. Later connections keep off them. */
  runs?: [Point, Point][]
  /** No path keeps the wanted spacing to the other lines. The line is drawn anyway, and runs closer than `TRACK` to another. */
  crowded?: true
}

/** Counts of the work the router does, for tests to assert on. Each is one integer increment, and nothing reads them in the app. */
export const routeStats = { searches: 0, expansions: 0, laneSorts: 0 }
export function resetRouteStats(): void {
  routeStats.searches = 0
  routeStats.expansions = 0
  routeStats.laneSorts = 0
}

export interface Plan {
  out: Side
  in: Side
  a: Point
  b: Point
  /** The side of a card is too full for a track between each anchor: the line is drawn, and marked crowded. */
  crowded?: true
}

export const NORMAL: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
}

/** Which sides of the two cards a connection leaves from and arrives at. */
export function pickSides(from: Rect, to: Rect): { out: Side; in: Side } {
  if (to.x >= from.x + from.width) return { out: 'right', in: 'left' }
  if (to.x + to.width <= from.x) return { out: 'left', in: 'right' }
  return to.y >= from.y ? { out: 'bottom', in: 'top' } : { out: 'top', in: 'bottom' }
}

/** How far apart connections that share a side of a card meet it, when the side has room. */
const SPREAD = 24
/** Connections that share a side of a card never meet it closer than this. */
const MIN_SPREAD = 16
/** Anchors keep this far from the corners of a card. */
const EDGE_MARGIN = 8

function sideMiddle(r: Rect, side: Side): Point {
  if (side === 'left') return { x: r.x, y: r.y + r.height / 2 }
  if (side === 'right') return { x: r.x + r.width, y: r.y + r.height / 2 }
  if (side === 'top') return { x: r.x + r.width / 2, y: r.y }
  return { x: r.x + r.width / 2, y: r.y + r.height }
}

/** The plan for a connection between two cards that leaves and arrives at the given sides, each at the middle of its side. */
export function planThrough(from: Rect, to: Rect, out: Side, into: Side): Plan {
  return { out, in: into, a: sideMiddle(from, out), b: sideMiddle(to, into) }
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
export function planEdges(rects: Readonly<Record<string, Rect>>, edges: readonly EdgeEnds[]): Map<string, Plan> {
  type Use = { edge: string; end: 'a' | 'b'; card: string; side: Side; across: number; other: Rect }
  const plans = new Map<string, Plan>()
  const vertical = (s: Side) => s === 'left' || s === 'right'
  const all: Use[] = []
  for (const e of edges) {
    const from = rects[e.from]
    const to = rects[e.to]
    if (!from || !to) continue
    const sides = pickSides(from, to)
    plans.set(e.id, { out: sides.out, in: sides.in, a: sideMiddle(from, sides.out), b: sideMiddle(to, sides.in) })
    const fromC = center(from)
    const toC = center(to)
    all.push({ edge: e.id, end: 'a', card: e.from, side: sides.out, across: vertical(sides.out) ? toC.y : toC.x, other: to })
    all.push({ edge: e.id, end: 'b', card: e.to, side: sides.in, across: vertical(sides.in) ? fromC.y : fromC.x, other: from })
  }

  const uses = new Map<string, Use[]>()
  const file = (u: Use) => {
    const key = `${u.card}|${u.side}`
    const list = uses.get(key)
    if (list) list.push(u)
    else uses.set(key, [u])
  }
  all.forEach(file)

  // How many anchors a side holds, a track apart and clear of the corners.
  const capacity = (card: Rect, side: Side) => Math.floor(((vertical(side) ? card.height : card.width) - 2 * EDGE_MARGIN) / MIN_SPREAD) + 1
  // A side with more connections than room sends the surplus, the ones furthest out, to the side that faces their other end.
  for (const [key, list] of [...uses]) {
    const card = rects[key.slice(0, key.lastIndexOf('|'))]
    if (!card) continue
    const side = list[0]!.side
    const cap = capacity(card, side)
    if (list.length <= cap) continue
    const mid = center(card)
    list.sort((p, q) => p.across - q.across || (p.edge < q.edge ? -1 : 1))
    const middle = vertical(side) ? mid.y : mid.x
    const move = [...list].sort((p, q) => Math.abs(q.across - middle) - Math.abs(p.across - middle) || (p.edge < q.edge ? -1 : 1)).slice(0, list.length - cap)
    for (const u of move) {
      const o = center(u.other)
      const alt: Side = vertical(side) ? (o.y >= mid.y ? 'bottom' : 'top') : o.x >= mid.x ? 'right' : 'left'
      const target = uses.get(`${u.card}|${alt}`)?.length ?? 0
      if (target >= capacity(card, alt)) continue
      list.splice(list.indexOf(u), 1)
      u.side = alt
      u.across = vertical(alt) ? o.y : o.x
      file(u)
      const plan = plans.get(u.edge)!
      if (u.end === 'a') {
        plan.out = alt
        plan.a = sideMiddle(card, alt)
      } else {
        plan.in = alt
        plan.b = sideMiddle(card, alt)
      }
    }
  }

  for (const [key, list] of uses) {
    const card = rects[key.slice(0, key.lastIndexOf('|'))]
    if (!card) continue
    const side = list[0]?.side
    if (!side) continue
    const along = vertical(side) ? 'y' : 'x'
    const room = (vertical(side) ? card.height : card.width) - 2 * EDGE_MARGIN
    const n = list.length
    // The anchors stay on the card. A side too full for a track between each is squeezed, and its lines are marked.
    const gap = n > 1 ? Math.min(SPREAD, room / (n - 1)) : 0
    list.sort((p, q) => p.across - q.across || (p.edge < q.edge ? -1 : 1))
    list.forEach((use, i) => {
      const plan = plans.get(use.edge)
      if (!plan) return
      if (n > 1 && gap < MIN_SPREAD) plan.crowded = true
      const point = use.end === 'a' ? plan.a : plan.b
      point[along] = Math.round(point[along] + (i - (n - 1) / 2) * gap)
    })
  }
  straighten(rects, plans, uses)
  return plans
}

/** Where one end of a connection meets a card. */
interface Anchor {
  edge: string
  end: 'a' | 'b'
  card: string
  side: Side
  /** The card at the other end. */
  other: Rect
}

/** Two ends that face each other this close to level are lined up, since so short a jog reads as a wobble, not a bend. */
const MAX_JOG = 48

/**
 * Lines up the two ends of a connection between cards that face each other, when they are off by a short jog and one end
 * can move there: inside its side, clear of the corners, a track from the other anchors on that side, and in the same
 * order among them, so the lines leaving that side still do not cross. The line is then one straight run, which reads
 * better and leaves its label a whole run to sit on.
 */
function straighten(
  rects: Readonly<Record<string, Rect>>,
  plans: ReadonlyMap<string, Plan>,
  uses: ReadonlyMap<string, readonly Anchor[]>,
): void {
  const pointOf = (u: Anchor) => {
    const plan = plans.get(u.edge) as Plan
    return u.end === 'a' ? plan.a : plan.b
  }
  // Moves one end to `value` along its side when that keeps it on the side, apart from and in order with the others.
  const moveTo = (u: Anchor, value: number): boolean => {
    const card = rects[u.card]
    if (!card) return false
    const across = u.side === 'left' || u.side === 'right'
    const along = across ? 'y' : 'x'
    const lo = (across ? card.y : card.x) + EDGE_MARGIN
    const hi = (across ? card.y + card.height : card.x + card.width) - EDGE_MARGIN
    if (value < lo || value > hi) return false
    const point = pointOf(u)
    const now = point[along]
    for (const other of uses.get(`${u.card}|${u.side}`) ?? []) {
      if (other.edge === u.edge && other.end === u.end) continue
      const at = pointOf(other)[along]
      if (Math.abs(at - value) < MIN_SPREAD) return false
      if (Math.sign(at - now) !== Math.sign(at - value)) return false
    }
    point[along] = value
    return true
  }
  const ends = new Map<string, { a?: Anchor; b?: Anchor }>()
  for (const list of uses.values()) {
    for (const u of list) {
      const entry = ends.get(u.edge) ?? {}
      entry[u.end] = u
      ends.set(u.edge, entry)
    }
  }
  for (const [edge, plan] of plans) {
    const facing = (plan.out === 'right' && plan.in === 'left') || (plan.out === 'left' && plan.in === 'right') || (plan.out === 'bottom' && plan.in === 'top') || (plan.out === 'top' && plan.in === 'bottom')
    if (!facing) continue
    const along = plan.out === 'left' || plan.out === 'right' ? 'y' : 'x'
    const jog = Math.abs(plan.a[along] - plan.b[along])
    if (jog === 0 || jog > MAX_JOG) continue
    const { a, b } = ends.get(edge) ?? {}
    if (!a || !b) continue
    // The end on the side with fewer lines moves first: it has more room.
    const sideCount = (u: Anchor) => uses.get(`${u.card}|${u.side}`)?.length ?? 0
    const [first, second] = sideCount(b) <= sideCount(a) ? [b, a] : [a, b]
    if (!moveTo(first, pointOf(second)[along])) moveTo(second, pointOf(first)[along])
  }
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** True when the straight run from p to q crosses the inside of the rectangle. */
function crosses(p: Point, q: Point, r: Rect): boolean {
  const minX = Math.min(p.x, q.x)
  const maxX = Math.max(p.x, q.x)
  const minY = Math.min(p.y, q.y)
  const maxY = Math.max(p.y, q.y)
  return maxX > r.x && minX < r.x + r.width && maxY > r.y && minY < r.y + r.height
}

/** How long a straight run is inside a rectangle. */
function lengthInside(p: Point, q: Point, r: Rect): number {
  if (p.y === q.y) {
    if (p.y <= r.y || p.y >= r.y + r.height) return 0
    return Math.max(0, Math.min(Math.max(p.x, q.x), r.x + r.width) - Math.max(Math.min(p.x, q.x), r.x))
  }
  if (p.x <= r.x || p.x >= r.x + r.width) return 0
  return Math.max(0, Math.min(Math.max(p.y, q.y), r.y + r.height) - Math.max(Math.min(p.y, q.y), r.y))
}

/**
 * True when a line comes within the keep-out margin of any of these cards.
 * It is the check for a line drawn earlier: it stays valid while no card has moved into its way.
 */
export function lineHitsCards(points: readonly Point[], cards: readonly Rect[]): boolean {
  const zones = cards.map((c) => inflate(c, MARGIN - 2))
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as Point
    const q = points[i + 1] ?? p
    for (const zone of zones) if (crosses(p, q, zone)) return true
  }
  return false
}

export function hitsAnyCard(route: Route, cards: readonly Rect[]): boolean {
  const boxes = cards.map((c) => inflate(c, 4))
  return route.points.some((p) => boxes.some((b) => inside(b, p)))
}

/** How many times lines that found no room are routed again first. */
export const RIP_UP_PASSES = 2
/** Lines keep this far from every card they pass. */
const MARGIN = 16
/** A line leaves a card straight out for at least this long, so its arrowhead never sits on a bend. */
export const STUB = 20
const TURN_COST = 36
/** Rounded corners. */
export const RADIUS = 8
/** Extra cost per unit of a run that lies along a path already drawn, so connections spread over the tracks of a gap. */
const SHARE_COST = 2.5
/** Extra cost for crossing a line already drawn. */
const CROSS_COST = 30
/** Extra cost per unit of a run inside a group area that neither end belongs to. */
const GROUP_COST = 0.6
/** Parallel runs of different lines that lie alongside each other are at least this far apart. */
export const TRACK = 16
/** The search stops after this many steps. A grid of lanes seldom needs a fiftieth of it. */
const SEARCH_LIMIT = 30000
/** A search that must keep every track free gives up sooner: when the room is not there it never finds it. */
const STRICT_LIMIT = 12000
/** The search leans toward the goal by this much. Above 1 it finds a path far sooner, at most this factor longer than the best. */
const GREED = 1.5
const BUCKET = 128
const bucketKey = (bx: number, by: number) => (bx + 4096) * 8192 + (by + 4096)

/** Sorted, with values within 3 of an earlier one dropped. */
function uniqueSorted(values: number[]): number[] {
  routeStats.laneSorts++
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const v of sorted) {
    const last = out[out.length - 1]
    if (last === undefined || v - last > 3) out.push(v)
  }
  return out
}

/** The tracks on each side of the middle of a gap that the search considers. */
const MID_TRACKS = 4
/** Tracks laid just outside every group area, and outside the whole drawing. */
const GROUP_TRACKS = 3
/** Tracks along each side of a card, for the lines that leave it and must turn at once. */
const SIDE_TRACKS = 4
const EDGE_TRACKS = 8

/**
 * Where the runs of a line may lie. Every run alongside others sits on a multiple of `TRACK`, so two runs that are not
 * on the same track are always a whole track apart: a gap holds as many lines as it has tracks, and none can sit
 * between two.
 */
const onTrack = (v: number): number => Math.round(v / TRACK) * TRACK

/** Lines worth running along: a track just off every card, and the tracks down the middle of each gap between cards. */
function laneValues(edges: { lo: number; hi: number }[]): number[] {
  const values: number[] = []
  for (const e of edges) {
    for (let k = 0; k < SIDE_TRACKS; k++) values.push(Math.floor((e.lo - MARGIN) / TRACK) * TRACK - k * TRACK, Math.ceil((e.hi + MARGIN) / TRACK) * TRACK + k * TRACK)
  }
  for (const p of edges) {
    for (const q of edges) {
      const gap = q.lo - p.hi
      if (gap <= 2 * MARGIN || gap >= 320) continue
      const first = Math.ceil((p.hi + MARGIN - 2) / TRACK)
      const last = Math.floor((q.lo - MARGIN + 2) / TRACK)
      const mid = Math.round((p.hi + q.lo) / 2 / TRACK)
      for (let k = first; k <= last; k++) if (Math.abs(k - mid) <= MID_TRACKS) values.push(k * TRACK)
    }
  }
  return values
}

/**
 * The lanes of the grid. `sorted` is the lanes of the cards, sorted and thinned once (see `uniqueSorted`). The exact values
 * asked for are kept, and the lanes near them give way, so a run can start and end where it must.
 */
function mergeLanes(exact: readonly number[], sorted: readonly number[]): number[] {
  const kept = sorted.filter((v) => !exact.some((e) => Math.abs(e - v) <= 3))
  return [...new Set([...kept, ...exact])].sort((a, b) => a - b)
}

/** A run already drawn, kept by direction so the cost of a new run reads only the runs that matter. */
type Run = readonly [Point, Point]

const LINE_BUCKET = 8
const SPAN_BUCKET = 64

function file<K>(map: Map<K, Run[]>, key: K, run: Run): void {
  const list = map.get(key)
  if (list) list.push(run)
  else map.set(key, [run])
}

/**
 * The runs of the lines drawn so far, indexed two ways: by the line they lie on, to find runs alongside, and by the
 * stretch they cover, to find runs across. A query reads only the buckets it touches.
 */
export class Drawn {
  private readonly rows = new Map<number, Run[]>()
  private readonly columns = new Map<number, Run[]>()
  /** Vertical runs by the rows of buckets they span, and horizontal runs by the columns. */
  private readonly verticalSpan = new Map<number, Run[]>()
  private readonly horizontalSpan = new Map<number, Run[]>()

  add(runs: readonly Run[]): void {
    for (const r of runs) {
      const [u, v] = r
      if (u.y === v.y && u.x !== v.x) {
        file(this.rows, Math.floor(u.y / LINE_BUCKET), r)
        for (let k = Math.floor(Math.min(u.x, v.x) / SPAN_BUCKET); k <= Math.floor(Math.max(u.x, v.x) / SPAN_BUCKET); k++) file(this.horizontalSpan, k, r)
      } else if (u.x === v.x && u.y !== v.y) {
        file(this.columns, Math.floor(u.x / LINE_BUCKET), r)
        for (let k = Math.floor(Math.min(u.y, v.y) / SPAN_BUCKET); k <= Math.floor(Math.max(u.y, v.y) / SPAN_BUCKET); k++) file(this.verticalSpan, k, r)
      }
    }
  }

  /** How much of the run lies along a run already drawn, within a few pixels. */
  shared(p: Point, q: Point): number {
    let total = 0
    const flat = p.y === q.y
    const at = flat ? p.y : p.x
    const lo = flat ? Math.min(p.x, q.x) : Math.min(p.y, q.y)
    const hi = flat ? Math.max(p.x, q.x) : Math.max(p.y, q.y)
    const index = flat ? this.rows : this.columns
    const key = Math.floor(at / LINE_BUCKET)
    for (let k = key - 1; k <= key + 1; k++) {
      for (const [u, v] of index.get(k) ?? []) {
        if (Math.abs((flat ? u.y : u.x) - at) > 4) continue
        const ulo = flat ? Math.min(u.x, v.x) : Math.min(u.y, v.y)
        const uhi = flat ? Math.max(u.x, v.x) : Math.max(u.y, v.y)
        total += Math.max(0, Math.min(hi, uhi) - Math.max(lo, ulo))
      }
    }
    return total
  }

  /** True when the run lies alongside a run already drawn, closer than `TRACK`, for any length. Runs that only touch end to end are not alongside. */
  tight(p: Point, q: Point): boolean {
    const flat = p.y === q.y
    if (!flat && p.x !== q.x) return false
    const at = flat ? p.y : p.x
    const lo = flat ? Math.min(p.x, q.x) : Math.min(p.y, q.y)
    const hi = flat ? Math.max(p.x, q.x) : Math.max(p.y, q.y)
    const index = flat ? this.rows : this.columns
    const key = Math.floor(at / LINE_BUCKET)
    const reach = Math.ceil(TRACK / LINE_BUCKET) + 1
    for (let k = key - reach; k <= key + reach; k++) {
      for (const [u, v] of index.get(k) ?? []) {
        if (Math.abs((flat ? u.y : u.x) - at) > TRACK - 0.5) continue
        const ulo = flat ? Math.min(u.x, v.x) : Math.min(u.y, v.y)
        const uhi = flat ? Math.max(u.x, v.x) : Math.max(u.y, v.y)
        if (Math.min(hi, uhi) - Math.max(lo, ulo) > 0) return true
      }
    }
    return false
  }

  /** How many runs already drawn the run crosses at a right angle. */
  crossings(p: Point, q: Point): number {
    let count = 0
    if (p.y === q.y) {
      const lo = Math.min(p.x, q.x)
      const hi = Math.max(p.x, q.x)
      for (const [u, v] of this.verticalSpan.get(Math.floor(p.y / SPAN_BUCKET)) ?? []) {
        if (u.x > lo && u.x < hi && p.y > Math.min(u.y, v.y) && p.y < Math.max(u.y, v.y)) count++
      }
    } else {
      const lo = Math.min(p.y, q.y)
      const hi = Math.max(p.y, q.y)
      for (const [u, v] of this.horizontalSpan.get(Math.floor(p.x / SPAN_BUCKET)) ?? []) {
        if (u.y > lo && u.y < hi && p.x > Math.min(u.x, v.x) && p.x < Math.max(u.x, v.x)) count++
      }
    }
    return count
  }

  cost(p: Point, q: Point): number {
    return this.shared(p, q) * SHARE_COST + this.crossings(p, q) * CROSS_COST
  }
}

/**
 * Everything about the cards that routing needs, worked out once per build and shared by every connection:
 * the keep-out boxes in a bucket grid, the group areas, and the candidate lines for the path search.
 */
export class Obstacles {
  readonly cards: readonly Rect[]
  readonly groups: readonly Rect[]
  /** The name of each group, which no line may cross, and the band that holds it, which no line may run along. */
  private readonly titles: Rect[]
  private readonly bands: Rect[]
  private readonly boxes: Rect[]
  private readonly buckets = new Map<number, number[]>()
  private readonly rawX: number[]
  private readonly rawY: number[]
  /** The lanes of the cards, sorted and thinned the first time a search asks, and kept for every search after it. */
  private sortedX: number[] | undefined
  private sortedY: number[] | undefined

  constructor(cards: readonly Rect[], groups: readonly (Rect & { label?: string })[] = []) {
    this.cards = cards
    this.groups = groups
    this.titles = groups.map((g) => inflate(groupTitle({ ...g, label: g.label ?? '' }), 3))
    this.bands = groups.map(groupBand)
    this.boxes = cards.map((c) => inflate(c, MARGIN - 2))
    this.boxes.forEach((box, i) => {
      for (let bx = Math.floor(box.x / BUCKET); bx <= Math.floor((box.x + box.width) / BUCKET); bx++) {
        for (let by = Math.floor(box.y / BUCKET); by <= Math.floor((box.y + box.height) / BUCKET); by++) {
          const key = bucketKey(bx, by)
          const list = this.buckets.get(key)
          if (list) list.push(i)
          else this.buckets.set(key, [i])
        }
      }
    })
    // Lanes just outside every group area too, so a line can go round a group name rather than through it.
    // Lanes in a row outside the whole drawing as well, where lines that go the long way round have all the room they need.
    const outer = (lo: number[], hi: number[]): number[] => {
      const values: number[] = []
      if (lo.length === 0) return values
      const first = Math.min(...lo)
      const last = Math.max(...hi)
      for (let k = 0; k < EDGE_TRACKS; k++) values.push(Math.floor((first - MARGIN) / TRACK) * TRACK - k * TRACK, Math.ceil((last + MARGIN) / TRACK) * TRACK + k * TRACK)
      return values
    }
    const around = (lo: number, hi: number): number[] => {
      const values: number[] = []
      for (let k = 0; k < GROUP_TRACKS; k++) values.push(Math.floor((lo - MARGIN) / TRACK) * TRACK - k * TRACK, Math.ceil((hi + MARGIN) / TRACK) * TRACK + k * TRACK)
      return values
    }
    this.rawX = [
      ...laneValues(cards.map((c) => ({ lo: c.x, hi: c.x + c.width }))),
      ...groups.flatMap((g) => around(g.x, g.x + g.width)),
      ...outer(
        cards.map((c) => c.x),
        cards.map((c) => c.x + c.width),
      ),
    ]
    this.rawY = [
      ...laneValues(cards.map((c) => ({ lo: c.y, hi: c.y + c.height }))),
      ...groups.flatMap((g) => around(g.y, g.y + g.height)),
      ...outer(
        cards.map((c) => c.y),
        cards.map((c) => c.y + c.height),
      ),
    ]
  }

  /** True when a point lies inside the keep-out zone of any card. */
  blocksPoint(p: Point): boolean {
    const list = this.buckets.get(bucketKey(Math.floor(p.x / BUCKET), Math.floor(p.y / BUCKET)))
    return list !== undefined && list.some((i) => inside(this.boxes[i] as Rect, p))
  }

  /** True when a straight run crosses the name of a group, or a level run lies in the band that holds it. */
  blocksBand(p: Point, q: Point): boolean {
    for (let i = 0; i < this.titles.length; i++) {
      if (crosses(p, q, this.titles[i] as Rect)) return true
      const band = this.bands[i] as Rect
      if (p.y === q.y && p.y > band.y && p.y < band.y + band.height && Math.max(p.x, q.x) > band.x && Math.min(p.x, q.x) < band.x + band.width) return true
    }
    return false
  }

  /** True when a straight run crosses the keep-out zone of any card, or the name of a group. */
  blocksRun(p: Point, q: Point): boolean {
    if (this.blocksBand(p, q)) return true
    const x0 = Math.floor(Math.min(p.x, q.x) / BUCKET)
    const x1 = Math.floor(Math.max(p.x, q.x) / BUCKET)
    const y0 = Math.floor(Math.min(p.y, q.y) / BUCKET)
    const y1 = Math.floor(Math.max(p.y, q.y) / BUCKET)
    for (let bx = x0; bx <= x1; bx++) {
      for (let by = y0; by <= y1; by++) {
        const list = this.buckets.get(bucketKey(bx, by))
        if (list?.some((i) => crosses(p, q, this.boxes[i] as Rect))) return true
      }
    }
    return false
  }

  /** The cost of the part of a run inside group areas other than the ones the connection belongs to. */
  groupCost(p: Point, q: Point, own: readonly Rect[]): number {
    let total = 0
    for (const g of this.groups) if (!own.includes(g)) total += lengthInside(p, q, g)
    return total * GROUP_COST
  }

  lanes(extraX: number[], extraY: number[]): [number[], number[]] {
    this.sortedX ??= uniqueSorted(this.rawX)
    this.sortedY ??= uniqueSorted(this.rawY)
    return [mergeLanes(extraX, this.sortedX), mergeLanes(extraY, this.sortedY)]
  }
}

/**
 * Finds a path of straight runs that stays out of every card, with A* over the lanes just off the cards and down the
 * gaps. It charges for each turn, for running along or across a line already drawn, and for passing through a group
 * area the connection does not belong to.
 */
function findPath(
  start: Point,
  end: Point,
  startDir: number,
  endDir: number,
  obstacles: Obstacles,
  drawn: Drawn,
  ownGroups: readonly Rect[],
  /** Refuse every step that would lie closer than `TRACK` to a line already drawn. */
  strict: boolean,
): { points: Point[]; cost: number } | undefined {
  const [xs, ys] = obstacles.lanes([start.x, end.x], [start.y, end.y])
  const width = xs.length
  const height = ys.length
  const DIRS = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ] as const

  const si = xs.indexOf(start.x)
  const sj = ys.indexOf(start.y)
  const ei = xs.indexOf(end.x)
  const ej = ys.indexOf(end.y)
  if (si < 0 || sj < 0 || ei < 0 || ej < 0) return undefined
  const ex = xs[ei] as number
  const ey = ys[ej] as number
  const guess = (i: number, j: number) => GREED * (Math.abs((xs[i] as number) - ex) + Math.abs((ys[j] as number) - ey))

  // Worked out the first time a spot or a step is looked at. 0 means not yet.
  const spotState = new Uint8Array(width * height)
  const stepState = new Uint8Array(width * height * 4)
  const stepCost = new Float64Array(width * height * 4)
  const best = new Float64Array(width * height * 4).fill(Infinity)
  const from = new Int32Array(width * height * 4).fill(-1)
  const spotFree = (i: number, j: number): boolean => {
    const at = j * width + i
    let state = spotState[at] as number
    if (state === 0) {
      state = obstacles.blocksPoint({ x: xs[i] as number, y: ys[j] as number }) ? 2 : 1
      spotState[at] = state
    }
    return state === 1
  }

  // A small binary heap of [estimate, state].
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

  // Leaving in any direction but straight out of the card is a turn, and so is arriving any way but straight in.
  for (let d = 0; d < 4; d++) {
    const state = (sj * width + si) * 4 + d
    best[state] = d === startDir ? 0 : TURN_COST
    push([(best[state] as number) + guess(si, sj), state])
  }
  let goal = -1
  let goalCost = Infinity
  let guard = 0
  routeStats.searches++
  for (let item = pop(); item && guard < (strict ? STRICT_LIMIT : SEARCH_LIMIT); item = pop(), guard++) {
    routeStats.expansions++
    const [estimate, state] = item
    if (estimate >= goalCost) break
    const d = state % 4
    const cell = (state - d) / 4
    const i = cell % width
    const j = (cell - i) / width
    const cost = best[state] as number
    if (estimate > cost + guess(i, j) + 1e-6) continue
    if (i === ei && j === ej) {
      const total = cost + (d === endDir ? 0 : TURN_COST)
      if (total < goalCost) {
        goalCost = total
        goal = state
      }
      continue
    }
    for (let nd = 0; nd < 4; nd++) {
      const dir = DIRS[nd] as readonly [number, number]
      const ni = i + dir[0]
      const nj = j + dir[1]
      const nx = xs[ni]
      const ny = ys[nj]
      if (nx === undefined || ny === undefined) continue
      if (nd !== d && nd === (d + 2) % 4) continue
      const move = cell * 4 + nd
      if (stepState[move] === 0) {
        const here = { x: xs[i] as number, y: ys[j] as number }
        const there = { x: nx, y: ny }
        if (!spotFree(ni, nj) || obstacles.blocksRun(here, there) || (strict && drawn.tight(here, there))) stepState[move] = 2
        else {
          stepState[move] = 1
          stepCost[move] = Math.abs(nx - here.x) + Math.abs(ny - here.y) + drawn.cost(here, there) + obstacles.groupCost(here, there, ownGroups)
        }
      }
      if (stepState[move] === 2) continue
      const next = cost + (stepCost[move] as number) + (nd === d ? 0 : TURN_COST)
      const key = (nj * width + ni) * 4 + nd
      if (next < (best[key] as number)) {
        best[key] = next
        from[key] = state
        push([next + guess(ni, nj), key])
      }
    }
  }
  if (goal < 0) return undefined

  const cells: Point[] = []
  for (let s = goal; s >= 0; s = from[s] as number) {
    const cell = (s - (s % 4)) / 4
    const i = cell % width
    cells.push({ x: xs[i] as number, y: ys[(cell - i) / width] as number })
  }
  cells.reverse()
  return { points: corners(cells), cost: goalCost }
}

/** Drops repeated points and points in the middle of a straight run, so only the ends and the corners are left. */
function corners(points: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const a = out[out.length - 2]
    const b = out[out.length - 1]
    if (b && b.x === p.x && b.y === p.y) continue
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) out[out.length - 1] = p
    else out.push(p)
  }
  return out
}

/**
 * Makes every run horizontal or vertical. A run that slopes, where two points that should line up miss by a pixel or
 * two, gets a short jog instead. The two ends of the line never move.
 */
function squareUp(points: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const q of points) {
    const p = out[out.length - 1]
    if (p && p.x !== q.x && p.y !== q.y) {
      const before = out[out.length - 2]
      // After a level run, go across next; after an upright one, go along.
      const level = before ? before.y === p.y : true
      out.push(level ? { x: p.x, y: q.y } : { x: q.x, y: p.y })
    }
    out.push(q)
  }
  return out
}

/** Turns corners into small curves and samples the result. */
export function rounded(points: readonly Point[]): Route {
  const list = corners(squareUp(points))
  const runs: [Point, Point][] = []
  for (let k = 1; k < list.length; k++) runs.push([list[k - 1] as Point, list[k] as Point])
  const first = list[0] as Point
  let d = `M ${first.x} ${first.y}`
  const sampled: Point[] = [first]
  const sample = (p: Point, q: Point) => {
    const length = Math.hypot(q.x - p.x, q.y - p.y)
    const n = Math.max(1, Math.round(length / 8))
    for (let i = 1; i <= n; i++) sampled.push(lerp(p, q, i / n))
  }
  let at = first
  for (let k = 1; k < list.length; k++) {
    const p = list[k] as Point
    const next = list[k + 1]
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
  return { d, points: sampled, runs }
}

const horizontal = (s: Side) => s === 'left' || s === 'right'

/** Where the straight run out of a card ends: at least `STUB` out, on a track, so the first turn lies on one. */
function stubEnd(at: Point, side: Side): Point {
  if (side === 'right') return { x: Math.ceil((at.x + STUB) / TRACK) * TRACK, y: at.y }
  if (side === 'left') return { x: Math.floor((at.x - STUB) / TRACK) * TRACK, y: at.y }
  if (side === 'bottom') return { x: at.x, y: Math.ceil((at.y + STUB) / TRACK) * TRACK }
  return { x: at.x, y: Math.floor((at.y - STUB) / TRACK) * TRACK }
}

/**
 * The corners of a line with at most two bends, worked out without a search. Facing sides get a run out, a run across
 * on a track of the gap between them, and a run in. `offset` moves that middle run to another track.
 */
function elbow(plan: Plan, offset = 0): Point[] {
  const { a, b } = plan
  const na = NORMAL[plan.out]
  const nb = NORMAL[plan.in]
  if (horizontal(plan.out) && horizontal(plan.in)) {
    if (plan.out !== plan.in && a.y === b.y) return [a, b]
    // Facing sides meet in the middle of the gap. Sides that face the same way go round past the further one.
    const x =
      plan.out !== plan.in
        ? onTrack((a.x + b.x) / 2) + offset
        : na.x > 0
          ? Math.ceil((Math.max(a.x, b.x) + STUB) / TRACK) * TRACK + offset
          : Math.floor((Math.min(a.x, b.x) - STUB) / TRACK) * TRACK + offset
    return [a, { x, y: a.y }, { x, y: b.y }, b]
  }
  if (!horizontal(plan.out) && !horizontal(plan.in)) {
    if (plan.out !== plan.in && a.x === b.x) return [a, b]
    const y =
      plan.out !== plan.in
        ? onTrack((a.y + b.y) / 2) + offset
        : na.y > 0
          ? Math.ceil((Math.max(a.y, b.y) + STUB) / TRACK) * TRACK + offset
          : Math.floor((Math.min(a.y, b.y) - STUB) / TRACK) * TRACK + offset
    return [a, { x: a.x, y }, { x: b.x, y }, b]
  }
  // One side across, one up or down: a single bend where the two runs meet, when it lies ahead of both sides.
  const corner = horizontal(plan.out) ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
  const ahead = (from: Point, n: Point) => (corner.x - from.x) * n.x + (corner.y - from.y) * n.y > STUB
  if (ahead(a, na) && ahead(b, nb)) return [a, corner, b]
  const sa = stubEnd(a, plan.out)
  const sb = stubEnd(b, plan.in)
  return horizontal(plan.out) ? [a, sa, { x: sa.x, y: sb.y }, sb, b] : [a, sa, { x: sb.x, y: sa.y }, sb, b]
}

/** Track offsets tried for the middle run of an elbow, nearest the middle first. */
const OFFSETS = [0, ...Array.from({ length: 8 }, (_, k) => [-(k + 1) * TRACK, (k + 1) * TRACK]).flat()]

/** The runs of an elbow that must be clear of cards: everything but the stubs at the two cards. */
function elbowClear(points: readonly Point[], plan: Plan, obstacles: Obstacles): boolean {
  const na = NORMAL[plan.out]
  const nb = NORMAL[plan.in]
  const list = [...points]
  const first = list[0] as Point
  const last = list[list.length - 1] as Point
  list[0] = { x: first.x + na.x * STUB, y: first.y + na.y * STUB }
  list[list.length - 1] = { x: last.x + nb.x * STUB, y: last.y + nb.y * STUB }
  for (let k = 1; k < list.length; k++) if (obstacles.blocksRun(list[k - 1] as Point, list[k] as Point)) return false
  return true
}

function runsOf(points: readonly Point[]): Run[] {
  const out: Run[] = []
  for (let k = 1; k < points.length; k++) out.push([points[k - 1] as Point, points[k] as Point])
  return out
}

/** Direction index of a step, as the path search counts them: right, down, left, up. */
function direction(n: Point): number {
  if (n.x > 0) return 0
  if (n.y > 0) return 1
  if (n.x < 0) return 2
  return 3
}

/**
 * The line for one connection, always made of straight runs with rounded corners. A straight run when the two ends
 * line up, else an elbow on the free track of the gap with the lowest cost, else a path found around the cards.
 * An elbow that runs along other lines, across them, or through a group area of neither end is compared with the
 * path search, and the cheaper one wins. A run never lies closer than `TRACK` to another line alongside it, and
 * never crosses the name of a group: when the gap is full the line goes another way. Only when no way exists the
 * line is drawn with the closest spacing it can have and marked `crowded`. Pass the `Obstacles` of the cards when
 * drawing many connections in one go, so the cards are indexed once, and the lines drawn so far in `drawn`.
 */
function routeOne(plan: Plan, cards: readonly Rect[], drawn: Drawn = new Drawn(), obstacles?: Obstacles, ownGroups: readonly Rect[] = []): Route {
  const grid = obstacles ?? new Obstacles(cards)
  const n1 = NORMAL[plan.out]
  const n2 = NORMAL[plan.in]
  const start = stubEnd(plan.a, plan.out)
  const end = stubEnd(plan.b, plan.in)

  const attempt = (strict: boolean): Point[] | undefined => {
    let best: { points: Point[]; cost: number; extra: number } | undefined
    for (const offset of OFFSETS) {
      const points = elbow(plan, offset)
      if (!elbowClear(points, plan, grid)) {
        // A straight line has no other track to try.
        if (points.length === 2) break
        continue
      }
      const runs = runsOf(points)
      if (strict && runs.some(([p, q]) => drawn.tight(p, q))) {
        if (points.length === 2) break
        continue
      }
      let extra = Math.abs(offset) * 0.5
      let length = 0
      for (const [p, q] of runs) {
        extra += drawn.cost(p, q) + grid.groupCost(p, q, ownGroups)
        length += Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
      }
      const cost = length + (points.length - 2) * TURN_COST + extra
      if (!best || cost < best.cost) best = { points, cost, extra }
      if (extra === 0 || points.length === 2) break
    }
    if (best && best.extra < 1) return best.points
    const found = findPath(start, end, direction(n1), direction({ x: -n2.x, y: -n2.y }), grid, drawn, ownGroups, strict)
    if (found && (!best || found.cost + STUB * 2 < best.cost)) {
      const path = [plan.a, start, ...found.points.slice(1, -1), end, plan.b]
      // The stubs at the two cards are part of the line, and must keep clear too.
      if (!strict || !(drawn.tight(plan.a, start) || drawn.tight(end, plan.b))) return path
    }
    return best?.points
  }

  const clean = attempt(true)
  if (clean) return rounded(clean)
  // The gap is full and no way round it is free: keep the other lines' cost low, but never leave the cards.
  const crowded = attempt(false)
  if (crowded) return { ...rounded(crowded), crowded: true }
  // Nothing gets through, such as between cards that touch. A plain elbow keeps the look of every other line.
  return { ...rounded(elbow(plan)), crowded: true }
}

export function routeConnection(plan: Plan, cards: readonly Rect[], drawn: Drawn = new Drawn(), obstacles?: Obstacles, ownGroups: readonly Rect[] = []): Route {
  const route = routeOne(plan, cards, drawn, obstacles, ownGroups)
  return plan.crowded && !route.crowded ? { ...route, crowded: true } : route
}

