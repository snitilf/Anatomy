import { Graph, layout } from '@dagrejs/dagre'
import type { Board } from '../board/schema'
import { MAX_WIDTH, narrowest } from '../canvas/labelPlacement'
import { checkLines } from '../canvas/crossings'
import type { Point, Size } from './geometry'
import { FAR_PARTS, groupPadding } from './groupArea'

/** The gaps of one layout, worked out from how many connections it has (`load`). */
interface Gaps {
  /** Between cards in one group: stacked across the flow, and between columns. */
  inner: { nodesep: number; ranksep: number }
  /** Between group areas and loose cards. */
  outer: { nodesep: number; ranksep: number }
  /** Between pieces that no connection joins: inside a group, and on the map. */
  member: number
  piece: number
  /** Between the rows a strip is wrapped into, before the room for the lines that cross the break. */
  row: number
}

/**
 * The gaps of a board read card by card. Two stacked cards keep one track of lines and its margins, and more only on a
 * busy board. A column gap starts at one track either side and opens to the room its lines and labels need (`openGaps`).
 */
const tightGaps = (load: number): Gaps => {
  const stacked = roomFor(Math.max(0, load - 2))
  return {
    inner: { nodesep: stacked, ranksep: 64 },
    outer: { nodesep: stacked, ranksep: 64 },
    member: roomFor(Math.ceil(load / 2)),
    piece: Math.max(64, roomFor(Math.ceil(load / 2))),
    row: 64,
  }
}

/**
 * The gaps of a board read in the far view (more than `FAR_PARTS` parts), roomier so the bundles between the blocks
 * run straight and apart.
 */
const roomyGaps = (load: number): Gaps => ({
  inner: { nodesep: roomFor(Math.ceil(load / 2)), ranksep: 96 },
  outer: { nodesep: Math.max(64, roomFor(Math.ceil(load / 2))), ranksep: 128 },
  member: roomFor(load),
  piece: Math.max(96, roomFor(load)),
  row: 96,
})
/**
 * A connected layout is a strip of columns, left to right. A strip much wider than the map is wrapped into rows of
 * columns, like text, so fitting it to the map does not shrink it to a thin line.
 */
/** A strip within this factor of the wanted ratio is left alone. */
const FLOW_SLACK = 1.12
/** Lines that run alongside each other are this far apart, and keep this far from a card. See `TRACK` and `MARGIN` in routing. */
const TRACK = 16
const MARGIN = 16

interface Box extends Size {
  id: string
}

interface Placed {
  /** Top-left of every member, relative to the top-left of the whole. */
  at: Map<string, Point>
  width: number
  height: number
}

interface Edge {
  from: string
  to: string
  weight: number
  /** The widest label of the connections it stands for. A label sits in the gap between two columns, so the gap has room for it. */
  label: number
}

/** Pieces of the graph that no edge joins, in the order of their first node. */
function pieces(ids: readonly string[], edges: readonly Edge[]): string[][] {
  const parent = new Map(ids.map((id) => [id, id]))
  const root = (id: string): string => {
    let r = id
    while (parent.get(r) !== r) r = parent.get(r) as string
    parent.set(id, r)
    return r
  }
  for (const e of edges) {
    if (!parent.has(e.from) || !parent.has(e.to)) continue
    const a = root(e.from)
    const b = root(e.to)
    if (a !== b) parent.set(b, a)
  }
  const out = new Map<string, string[]>()
  for (const id of ids) {
    const r = root(id)
    const list = out.get(r)
    if (list) list.push(id)
    else out.set(r, [id])
  }
  return [...out.values()]
}

interface Spot {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** Consecutive columns of the strip, with the lines that cross the gap after each one. */
interface Columns {
  /** The nodes of each column, in the order of the columns. */
  list: Spot[][]
  /** For each gap between column i and i + 1, how many connections cross it. */
  crossing: number[]
  /** For each gap, the widest label of a connection that joins the two columns next to it. */
  labels: number[]
}

function columnsOf(spots: readonly Spot[], edges: readonly Edge[]): Columns {
  const centers = [...new Set(spots.map((n) => Math.round(n.x + n.width / 2)))].sort((a, b) => a - b)
  // Dagre gives every node of a rank the same center. Nodes whose centers differ by a pixel or two still share a column.
  const merged: number[] = []
  for (const c of centers) if (merged.length === 0 || c - (merged[merged.length - 1] as number) > 3) merged.push(c)
  const indexOf = (n: Spot) => {
    const c = Math.round(n.x + n.width / 2)
    let best = 0
    merged.forEach((m, k) => {
      if (Math.abs(m - c) < Math.abs((merged[best] as number) - c)) best = k
    })
    return best
  }
  const list: Spot[][] = merged.map(() => [])
  const rank = new Map<string, number>()
  for (const n of spots) {
    const k = indexOf(n)
    ;(list[k] as Spot[]).push(n)
    rank.set(n.id, k)
  }
  const crossing = merged.slice(1).map(() => 0)
  const labels = merged.slice(1).map(() => 0)
  for (const e of edges) {
    const a = rank.get(e.from)
    const b = rank.get(e.to)
    if (a === undefined || b === undefined || a === b) continue
    for (let k = Math.min(a, b); k < Math.max(a, b); k++) crossing[k] = (crossing[k] as number) + e.weight
    if (Math.abs(a - b) === 1) labels[Math.min(a, b)] = Math.max(labels[Math.min(a, b)] as number, e.label)
  }
  return { list, crossing, labels }
}

/** What a gap holds besides the widest label: the lines either side of it, and the keep-out margin of the cards. */
const LABEL_ROOM = 64

/**
 * The room a gap needs to carry this many lines on tracks, with a track to spare for the grid they sit on. Callers count
 * whole lines: the connection that closes a loop weighs a tenth (`LOOP_WEIGHT`) and adds no track, so it moves nothing.
 */
const roomFor = (lines: number) => MARGIN * 2 + TRACK * (lines + 1)

const left = (col: readonly Spot[]) => Math.min(...col.map((n) => n.x))
const right = (col: readonly Spot[]) => Math.max(...col.map((n) => n.x + n.width))

/**
 * Opens the gap after every column to the room its connections need, so lines have tracks to run on and are never
 * packed between the cards. A gap that is wide enough stays as it is.
 */
function openGaps(cols: Columns): void {
  let shift = 0
  cols.list.forEach((col, k) => {
    for (const n of col) n.x += shift
    const next = cols.list[k + 1]
    if (!next) return
    const gap = left(next) + shift - right(col)
    // A label sits across the line in the middle of the gap, or on its straight run, with a margin for the cards and arrow.
    const want = Math.min(Math.max(roomFor(Math.floor(cols.crossing[k] as number)), (cols.labels[k] as number) + LABEL_ROOM), 400)
    if (gap < want) shift += want - gap
  })
}

/** Splits the columns into at most `rows` runs, in order, so the widest run is as narrow as it can be. */
function splitColumns(widths: readonly number[], rows: number): number[] {
  const n = widths.length
  const prefix = [0]
  for (const w of widths) prefix.push((prefix[prefix.length - 1] as number) + w)
  const span = (a: number, b: number) => (prefix[b] as number) - (prefix[a] as number)
  // best[r][i]: the narrowest widest-run when the first i columns go in r runs.
  const best: number[][] = Array.from({ length: rows + 1 }, () => Array<number>(n + 1).fill(Infinity))
  const cut: number[][] = Array.from({ length: rows + 1 }, () => Array<number>(n + 1).fill(0))
  best[0]![0] = 0
  for (let r = 1; r <= rows; r++) {
    for (let i = 1; i <= n; i++) {
      for (let j = r - 1; j < i; j++) {
        const w = Math.max(best[r - 1]![j] as number, span(j, i))
        if (w < (best[r]![i] as number)) {
          best[r]![i] = w
          cut[r]![i] = j
        }
      }
    }
  }
  const starts: number[] = []
  for (let r = rows, i = n; r >= 1; r--) {
    const j = cut[r]![i] as number
    starts.unshift(j)
    i = j
  }
  return starts
}

/** Wraps the columns into rows toward the wanted ratio. Rows read top to bottom, and each reads left to right. */
function wrapColumns(cols: Columns, aspect: number, slack: number, rowGap: number): void {
  const count = cols.list.length
  const box = () => {
    const nodes = cols.list.flat()
    const w = Math.max(...nodes.map((n) => n.x + n.width)) - Math.min(...nodes.map((n) => n.x))
    const h = Math.max(...nodes.map((n) => n.y + n.height)) - Math.min(...nodes.map((n) => n.y))
    return { w, h }
  }
  const flat = box()
  const ratio = flat.w / flat.h
  if (count < 3 || (ratio <= aspect * slack && ratio >= aspect / slack)) return
  // A column's width is its own, and the gap after it goes with it, so a row ends at a column.
  const widths = cols.list.map((col, k) => {
    const next = cols.list[k + 1]
    return (next ? left(next) : right(col)) - left(col)
  })
  const sliceOf = (starts: readonly number[], r: number) => cols.list.slice(starts[r], starts[r + 1] ?? count)
  const heightOf = (nodes: readonly Spot[]) => Math.max(...nodes.map((n) => n.y + n.height)) - Math.min(...nodes.map((n) => n.y))
  // Every connection that crosses a break needs its own track along the gap between the two rows.
  const gapAt = (start: number) => Math.max(rowGap, roomFor(Math.floor(cols.crossing[start - 1] as number)))
  let choice: { starts: number[]; score: number } | undefined
  for (let rows = 1; rows <= Math.min(count, 6); rows++) {
    layoutStats.wrapShapes++
    const starts = splitColumns(widths, rows)
    if (new Set(starts).size !== starts.length) continue
    let width = 0
    let height = 0
    starts.forEach((s, r) => {
      const slice = sliceOf(starts, r)
      width = Math.max(width, right(slice[slice.length - 1] as Spot[]) - left(slice[0] as Spot[]))
      height += heightOf(slice.flat()) + (r > 0 ? gapAt(s) : 0)
    })
    // The size it fits a map of the wanted ratio at, with a little held against each extra row.
    const score = Math.log(Math.max(width / aspect, height)) + (rows - 1) * 0.04
    if (!choice || score < choice.score) choice = { starts, score }
  }
  if (!choice || choice.starts.length === 1) return
  const { starts } = choice
  let top = 0
  starts.forEach((s, r) => {
    const slice = sliceOf(starts, r)
    const nodes = slice.flat()
    const x0 = left(slice[0] as Spot[])
    const y0 = Math.min(...nodes.map((n) => n.y))
    if (r > 0) top += gapAt(s)
    for (const n of nodes) {
      n.x -= x0
      n.y += top - y0
    }
    top += heightOf(nodes)
  })
}

/** Counts of the work a layout does, for tests to assert on. Each is one integer increment, and nothing reads them in the app. */
export const layoutStats = { layouts: 0, dagreRuns: 0, wrapShapes: 0 }
export function resetLayoutStats(): void {
  layoutStats.layouts = 0
  layoutStats.dagreRuns = 0
  layoutStats.wrapShapes = 0
}

/** The layers dagre found for the layout in progress, by input. The shapes tried for one board share them. */
let dagreMemo: Map<string, Spot[]> | undefined

/** A layered left-to-right layout of one connected piece. Dagre returns centers; this returns top-left corners from zero. */
function flow(boxes: readonly Box[], edges: readonly Edge[], spacing: { nodesep: number; ranksep: number; row: number }, aspect: number, slack: number): Placed {
  if (boxes.length === 1) {
    const only = boxes[0] as Box
    return { at: new Map([[only.id, { x: 0, y: 0 }]]), width: only.width, height: only.height }
  }
  const key = `${spacing.nodesep}|${spacing.ranksep}|${boxes.map((b) => `${b.id}:${b.width}x${b.height}`).join(',')}|${edges.map((e) => `${e.from}>${e.to}:${e.weight}`).join(',')}`
  let base = dagreMemo?.get(key)
  if (!base) {
    const g = new Graph({ multigraph: true })
    g.setGraph({ rankdir: 'LR', acyclicer: 'greedy', ...spacing })
    g.setDefaultEdgeLabel(() => ({}))
    for (const b of boxes) g.setNode(b.id, { width: b.width, height: b.height })
    edges.forEach((e, i) => {
      if (e.from !== e.to) g.setEdge(e.from, e.to, { weight: e.weight, minlen: 1 }, String(i))
    })
    layoutStats.dagreRuns++
    layout(g)
    base = boxes.map((b) => {
      const n = g.node(b.id) as { x: number; y: number }
      return { id: b.id, x: n.x - b.width / 2, y: n.y - b.height / 2, width: b.width, height: b.height }
    })
    dagreMemo?.set(key, base)
  }
  // The columns are moved about below, so each use has its own copy.
  const spots: Spot[] = base.map((n) => ({ ...n }))
  const cols = columnsOf(spots, edges)
  openGaps(cols)
  wrapColumns(cols, aspect, slack, spacing.row)
  const minX = Math.min(...spots.map((r) => r.x))
  const minY = Math.min(...spots.map((r) => r.y))
  const at = new Map(spots.map((r) => [r.id, { x: Math.round(r.x - minX), y: Math.round(r.y - minY) }]))
  const width = Math.max(...spots.map((r) => r.x + r.width)) - minX
  const height = Math.max(...spots.map((r) => r.y + r.height)) - minY
  return { at, width: Math.round(width), height: Math.round(height) }
}

/** Packs pieces in rows, left to right, toward a width that gives the whole about the wanted ratio. */
function pack(parts: readonly Placed[], aspect: number, gap: number): { offsets: Point[]; width: number; height: number } {
  const area = parts.reduce((sum, p) => sum + (p.width + gap) * (p.height + gap), 0)
  const widest = Math.max(...parts.map((p) => p.width))
  const limit = Math.max(widest, Math.sqrt(area * aspect))
  const offsets: Point[] = []
  let x = 0
  let y = 0
  let row = 0
  let width = 0
  for (const p of parts) {
    if (x > 0 && x + p.width > limit) {
      y += row + gap
      x = 0
      row = 0
    }
    offsets.push({ x, y })
    width = Math.max(width, x + p.width)
    row = Math.max(row, p.height)
    x += p.width + gap
  }
  return { offsets, width, height: y + row }
}

/** Lays out each connected piece on its own, then packs the pieces. */
function flowAndPack(
  boxes: readonly Box[],
  edges: readonly Edge[],
  spacing: { nodesep: number; ranksep: number; row: number },
  aspect: number,
  gap: number,
  largestFirst: boolean,
  wrap: { aspect: number; slack: number },
  lift: boolean,
): Placed {
  const byId = new Map(boxes.map((b) => [b.id, b]))
  const order = new Map(boxes.map((b, i) => [b.id, i]))
  const groups = pieces(
    boxes.map((b) => b.id),
    edges,
  )
  if (largestFirst) groups.sort((a, b) => b.length - a.length || (order.get(a[0] as string) ?? 0) - (order.get(b[0] as string) ?? 0))
  const laid = groups.map((ids) => {
    const set = new Set(ids)
    return flow(
      ids.map((id) => byId.get(id) as Box),
      edges.filter((e) => set.has(e.from) && set.has(e.to)),
      spacing,
      wrap.aspect,
      wrap.slack,
    )
  })
  const { offsets, width, height } = pack(laid, aspect, gap)
  const at = new Map<string, Point>()
  laid.forEach((p, i) => {
    const o = offsets[i] as Point
    for (const [id, q] of p.at) at.set(id, { x: o.x + q.x, y: o.y + q.y })
  })
  return lift ? settle({ at, width, height }, byId, edges, spacing.nodesep) : { at, width, height }
}

/**
 * Takes back the room a wrapped row or a packed piece leaves above a box, so the whole gets shorter. Each box is lifted
 * as far as the boxes above it allow, keeping `gap` below each one it stands under and its place across: that gives the
 * new height. Then each box goes back to where it was in proportion to that height, as far as the boxes above and below
 * it let it, so a card that sat between two others stays between them and its lines stay straight. The order down the
 * map and every place across stay as they were. Kept only when the whole gets shorter.
 */
function settle(placed: Placed, sizes: ReadonlyMap<string, Size>, edges: readonly Edge[], gap: number): Placed {
  const boxes = [...placed.at].map(([id, p]) => ({ id, x: p.x, y: p.y, ...(sizes.get(id) as Size) }))
  boxes.sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1))
  // Boxes beside each other with a gap of a track or more between them do not hold each other up.
  const stacked = (a: (typeof boxes)[number], b: (typeof boxes)[number]) => a.x < b.x + b.width + gap && b.x < a.x + a.width + gap
  // The lines that leave a box downward and upward, as the boxes stand now. A gap keeps a track for each line that
  // leaves the box above it downward or the box below it upward.
  const byId = new Map(boxes.map((b) => [b.id, b]))
  const downward = new Map<string, number>()
  const upward = new Map<string, number>()
  for (const e of edges) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    // A connection that closes a loop never moves a card: see `loopClosers`.
    if (!a || !b || e.weight === LOOP_WEIGHT) continue
    for (const [p, q] of [
      [a, b],
      [b, a],
    ] as const) {
      if (q.y >= p.y + p.height) downward.set(p.id, (downward.get(p.id) ?? 0) + 1)
      else if (q.y + q.height <= p.y) upward.set(p.id, (upward.get(p.id) ?? 0) + 1)
    }
  }
  // Never more than the two had before, so where they stood is always allowed.
  const gapBetween = (above: (typeof boxes)[number], below: (typeof boxes)[number]) =>
    Math.min(below.y - above.y - above.height, Math.max(gap, roomFor((downward.get(above.id) ?? 0) + (upward.get(below.id) ?? 0))))
  const up = new Map<string, number>()
  for (const [i, b] of boxes.entries()) {
    let top = 0
    for (const d of boxes.slice(0, i)) if (stacked(d, b)) top = Math.max(top, (up.get(d.id) as number) + d.height + gapBetween(d, b))
    up.set(b.id, Math.min(b.y, top))
  }
  const height = Math.max(...boxes.map((b) => (up.get(b.id) as number) + b.height))
  if (height >= placed.height) return placed
  // The lowest each box can sit with the boxes under it still above the new bottom.
  const down = new Map<string, number>()
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i] as (typeof boxes)[number]
    let bottom = height
    for (const d of boxes.slice(i + 1)) if (stacked(d, b)) bottom = Math.min(bottom, (down.get(d.id) as number) - gapBetween(b, d))
    down.set(b.id, bottom - b.height)
  }
  const at = new Map<string, Point>()
  const done: (typeof boxes)[number][] = []
  for (const b of boxes) {
    let top = 0
    for (const d of done) if (stacked(d, b)) top = Math.max(top, (at.get(d.id) as Point).y + d.height + gapBetween(d, b))
    const middle = ((b.y + b.height / 2) * height) / placed.height
    const y = Math.round(Math.min(down.get(b.id) as number, Math.max(top, middle - b.height / 2)))
    at.set(b.id, { x: b.x, y })
    done.push(b)
  }
  return { at, width: placed.width, height }
}

/**
 * The connections that close a loop: each runs against the order of the file, from a card that the cards before it
 * already reach by connections that follow the file.
 */
function loopClosers(relations: readonly { id: string; from: string; to: string }[], order: ReadonlyMap<string, number>): Set<string> {
  const next = new Map<string, string[]>()
  for (const r of relations) if ((order.get(r.from) ?? 0) < (order.get(r.to) ?? 0)) next.set(r.from, [...(next.get(r.from) ?? []), r.to])
  const reaches = (from: string, to: string) => {
    const seen = new Set([from])
    const stack = [from]
    while (stack.length > 0) {
      const at = stack.pop() as string
      if (at === to) return true
      for (const n of next.get(at) ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          stack.push(n)
        }
      }
    }
    return false
  }
  return new Set(relations.filter((r) => (order.get(r.from) ?? 0) > (order.get(r.to) ?? 0) && reaches(r.to, r.from)).map((r) => r.id))
}

/** Lighter than any one connection, so ranking gives up this edge first. */
const LOOP_WEIGHT = 0.1

/**
 * Merges the connections between two nodes into one edge, with the count as its weight. Connections in both directions
 * become one edge from the node the board lists first: a reply that comes back does not turn the flow around.
 * A connection that only runs backward keeps its own direction, so the card it comes from sits on the left. The exception
 * is a connection that closes a loop: it is turned to follow the file and given the lightest weight, so ranking breaks
 * the loop at its closing connection and the cards keep the order of the board.
 */
function oriented(pairs: readonly { from: string; to: string; label: number }[], order: ReadonlyMap<string, number>): Edge[] {
  const out = new Map<string, Edge & { back: number }>()
  for (const p of pairs) {
    if (p.from === p.to) continue
    const forward = (order.get(p.from) ?? 0) <= (order.get(p.to) ?? 0)
    const [a, b] = forward ? [p.from, p.to] : [p.to, p.from]
    const key = `${a}\u0000${b}`
    const e = out.get(key) ?? { from: a, to: b, weight: 0, back: 0, label: 0 }
    e.label = Math.max(e.label, p.label)
    if (forward) e.weight++
    else e.back++
    out.set(key, e)
  }
  const all = [...out.values()]
  // The edges that follow the file never form a loop, so a back-only edge closes one when its target already leads to its source.
  const next = new Map<string, string[]>()
  const link = (from: string, to: string) => next.set(from, [...(next.get(from) ?? []), to])
  for (const e of all) if (e.weight > 0) link(e.from, e.to)
  const reaches = (from: string, to: string) => {
    const seen = new Set([from])
    const stack = [from]
    while (stack.length > 0) {
      const at = stack.pop() as string
      if (at === to) return true
      for (const n of next.get(at) ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          stack.push(n)
        }
      }
    }
    return false
  }
  const result: Edge[] = []
  const lone = all.filter((e) => e.weight === 0)
  for (const e of all) if (e.weight > 0) result.push({ from: e.from, to: e.to, weight: e.weight + e.back, label: e.label })
  for (const e of lone) {
    // e runs from the earlier card; its real direction is e.to -> e.from.
    // The turned edge points forward like the rest, so no loop is left for the acyclic step to break by reversing some
    // edge of the chain. Its low weight keeps this shortcut from pulling its two ends close together.
    if (reaches(e.from, e.to)) {
      result.push({ from: e.from, to: e.to, weight: LOOP_WEIGHT, label: e.label })
      link(e.from, e.to)
    } else {
      result.push({ from: e.to, to: e.from, weight: e.back, label: e.label })
      link(e.to, e.from)
    }
  }
  return result
}

/** The shapes tried for a layout: the ratio a group is packed toward, and the ratio of the whole. */
const GROUP_SHAPES = [0.7, 1, 1.6, 2.4, 3]
const MAP_SHAPES = [0.8, 1, 1.15, 1.3, 1.45, 1.6, 2]
/**
 * The shape the layout aims for: the free map area of a 1440x900 and a 1280x800 window with the sidebar docked, less the
 * room Fit keeps around the board (998x738 and 838x638). It is a constant: the layout never reads the window size.
 */
const WANTED_ASPECT = 1.33
/** Unconnected pieces are packed in rows toward this ratio when the strips are not wrapped. */
const PACK_ASPECT = 1.6
/** The shapes tried for a board read in the far view, and the ratio its whole aims at. */
const FAR_GROUP_SHAPES = [1, 1.3, 1.6, 2, 2.4]
const FAR_MAP_SHAPES = [1.3, 1.6, 2]
const FAR_ASPECT = 1.45
/**
 * A board of up to this many parts, the size the authoring guide asks for, has its few smallest layouts routed to count
 * the lines that cross. Routing grows with the square of the connections, so larger boards take the smallest layout.
 */
const ROUTED_PARTS = 16
/** At most this many layouts are routed, the smallest first. */
const ROUTED = 6
/** Layouts that fit at a zoom within this share of the smallest one's are routed, as a log: 30 percent. */
const ROUTED_BAND = Math.log(1.3)
/** What a connection that runs right to left costs against the size of the whole, which is scored as a log. */
const BACKWARD_COST = 0.05
/**
 * The map area of the reference laptop window (1440x900, sidebar docked) less the room Fit keeps, and the zooms at which
 * a fitted card shows in full (an 11 px title from a 13 px one) and as a title (D143).
 */
const REFERENCE = { width: 998, height: 738 }
const DETAIL_ZOOMS = [0.85, 0.5]
/** How many detail levels a layout of this size keeps when fitted to the reference window: 2 full, 1 titles, 0 far. */
const detailAt = (laid: { width: number; height: number }) => {
  const zoom = Math.min(REFERENCE.width / laid.width, REFERENCE.height / laid.height)
  return DETAIL_ZOOMS.filter((z) => zoom >= z).length
}
/** A layout is about as clean as the cleanest when its tangle is at most this many times the least, plus one. */
const TANGLE_SLACK = 1.25

/**
 * A layered left-to-right layout of the cards, following the connections. It runs in two passes: the members of each
 * group are laid out on their own, then each group is one block among the loose cards. Pieces that no connection joins
 * are packed in rows, and a strip much wider than the map is wrapped into rows. Several shapes are tried, and the one
 * that fits largest in a map of the wanted shape wins, so fitting it to the screen leaves little of the map empty.
 * Lines that cross and connections that run backward count against a shape, and a shape in which more connections run
 * backward than forward is never picked: the board reads left to right.
 * The same board always gives the same result: it never reads the window. Returns the top-left corner of each card.
 *
 * Only the cards in `ids` are placed, and only the connections between them count. All cards when it is left out.
 */
export function autoLayout(board: Board, sizeOf: (id: string) => Size, ids?: ReadonlySet<string>): Record<string, Point> {
  const cards = board.components.filter((c) => !ids || ids.has(c.id))
  if (cards.length === 0) return {}
  const placed = new Set(cards.map((c) => c.id))
  const relations = board.relationships.filter((r) => placed.has(r.from) && placed.has(r.to))
  // A connection that closes a loop runs back by nature. Neither its direction, its crossings, nor its label count for a
  // layout, so closing a loop never moves the cards of the loop.
  const loops = loopClosers(relations, new Map(cards.map((c, i) => [c.id, i])))

  /** How many connections run right to left, or `undefined` when they outnumber those that run left to right. */
  const backwardOf = (out: Record<string, Point>) => {
    let forward = 0
    let backward = 0
    for (const r of relations) {
      if (loops.has(r.id)) continue
      const a = out[r.from]
      const b = out[r.to]
      if (!a || !b) continue
      if (a.x < b.x) forward++
      else if (a.x > b.x) backward++
    }
    return backward > forward ? undefined : backward
  }
  layoutStats.layouts++
  dagreMemo = new Map()
  try {
    const prep = prepare(board, sizeOf, cards, board.components.length <= FAR_PARTS)
    // Every distinct layout the shapes give, with its score: the log of the zoom that fits it in a map of the wanted
    // shape, so smaller is better, and what its backward connections cost.
    const found = new Map<string, { out: Record<string, Point>; size: number; score: number; level: number }>()
    const careful = prep.lift
    for (const group of careful ? GROUP_SHAPES : FAR_GROUP_SHAPES) {
      for (const map of [...(careful ? MAP_SHAPES : FAR_MAP_SHAPES), Infinity]) {
        const laid = layoutOnce(prep, group, map)
        const backward = backwardOf(laid.out)
        if (backward === undefined) continue
        const size = Math.log(Math.max(laid.width / WANTED_ASPECT, laid.height))
        // A board read in the far view aims at the shape of the map, with a little held against its area.
        const score = careful ? size + BACKWARD_COST * backward : Math.abs(Math.log(laid.width / laid.height / FAR_ASPECT)) + Math.log((laid.width * laid.height) / 1e6) * 0.05
        const key = JSON.stringify(laid.out)
        if ((found.get(key)?.score ?? Infinity) > score) found.set(key, { out: laid.out, size, score, level: detailAt(laid) })
      }
    }
    // Sorted by score, then by the order they were found in, which is fixed.
    const ranked = [...found.values()].sort((a, b) => a.score - b.score)
    // The layout with every strip kept whole always reads left to right, and is the fallback.
    if (ranked.length === 0) return layoutOnce(prep, GROUP_SHAPES[0] as number, Infinity).out
    if (cards.length > ROUTED_PARTS) return makeRoom(board, (ranked[0] as (typeof ranked)[number]).out, sizeOf, loops, prep.lift ? ROOM_STEP : FAR_ROOM_STEP)
    // The layouts close to the smallest are drawn, to count how tangled each one reads: its crossings, twice its
    // backward connections, and three times each label with no place. Of those about as clean as the cleanest, the
    // smallest wins, so a layout a little larger is taken when it reads clearly cleaner. A cleaner layout never costs a
    // level of detail on the reference window that the smallest one reaches.
    const rectsOf = (out: Record<string, Point>) => Object.fromEntries(Object.entries(out).map(([id, p]) => [id, { ...p, ...sizeOf(id) }]))
    const smallest = Math.min(...ranked.map((c) => c.size))
    const level = Math.max(...ranked.map((c) => c.level))
    const close = ranked.filter((c) => c.size <= smallest + ROUTED_BAND && c.level === level).slice(0, ROUTED)
    let chosen = (close[0] ?? ranked[0]) as (typeof ranked)[number]
    if (close.length > 1) {
      const tangles = close.map((c) => {
        const check = checkLines(board, rectsOf(c.out), loops)
        return check.crossings + 2 * (backwardOf(c.out) ?? 0) + 3 * check.unplaced.length
      })
      const cleanest = Math.min(...tangles)
      let chosenSize = Infinity
      close.forEach((c, i) => {
        if ((tangles[i] as number) <= cleanest * TANGLE_SLACK + 1 && c.size < chosenSize - 1e-9) {
          chosen = c
          chosenSize = c.size
        }
      })
    }
    return makeRoom(board, chosen.out, sizeOf, loops, ROOM_STEP)
  } finally {
    dagreMemo = undefined
  }
}

/** How many times room is made for labels that found no place. */
const ROOM_PASSES = 2
/** How much a gap opens for a label that found no place: a label's own margins and one more track. */
const ROOM_STEP = 64
/** On a board read in the far view, whose gaps are roomier already, a gap opens by one track. */
const FAR_ROOM_STEP = 16

/**
 * Opens the gap a label could not find a place in. For a connection between cards side by side, every card that starts
 * right of the left card moves right; between cards one above the other, every card that starts below the upper card
 * moves down. Nothing else moves, so no two cards get closer. Repeats while labels still find no place.
 */
function makeRoom(board: Board, start: Record<string, Point>, sizeOf: (id: string) => Size, skip: ReadonlySet<string>, step: number): Record<string, Point> {
  let out = start
  for (let pass = 0; pass < ROOM_PASSES; pass++) {
    const rects = Object.fromEntries(Object.entries(out).map(([id, p]) => [id, { ...p, ...sizeOf(id) }]))
    const { unplaced } = checkLines(board, rects, skip)
    if (unplaced.length === 0) break
    const across = new Set<number>()
    const down = new Set<number>()
    for (const id of unplaced) {
      const r = board.relationships.find((x) => x.id === id)
      const a = r && rects[r.from]
      const b = r && rects[r.to]
      if (!a || !b) continue
      const [left, right] = a.x <= b.x ? [a, b] : [b, a]
      const [top, bottom] = a.y <= b.y ? [a, b] : [b, a]
      if (right.x >= left.x + left.width) across.add(left.x + left.width)
      else if (bottom.y >= top.y + top.height) down.add(top.y + top.height)
    }
    if (across.size === 0 && down.size === 0) break
    out = Object.fromEntries(
      Object.entries(out).map(([id, p]) => [
        id,
        {
          x: p.x + step * [...across].filter((at) => p.x >= at).length,
          y: p.y + step * [...down].filter((at) => p.y >= at).length,
        },
      ]),
    )
  }
  return out
}

/** What a layout needs that does not depend on the shapes tried: the blocks, the members of each group, and their edges. */
interface Prepared {
  cards: readonly Board['components'][number][]
  sizeOf: (id: string) => Size
  /** The block of each card: its group, or the card itself. */
  blockOf: ReadonlyMap<string, string>
  /** The members of each group block, their sizes, and the edges between them. */
  groups: ReadonlyMap<string, { boxes: Box[]; edges: Edge[] }>
  outerEdges: Edge[]
  load: number
  /** Each group laid out at a shape, kept for the other shapes of the whole that try it. */
  inner: Map<string, Placed>
  /** Boxes are lifted into the room above them (`settle`). */
  lift: boolean
  gaps: Gaps
  /** The room inside each group area. */
  pad: { side: number; top: number; bottom: number }
}

function prepare(board: Board, sizeOf: (id: string) => Size, cards: readonly Board['components'][number][], lift: boolean): Prepared {
  const groupIds = new Set(board.groups.map((g) => g.id))
  const blockOf = new Map<string, string>()
  for (const c of cards) blockOf.set(c.id, c.group !== undefined && groupIds.has(c.group) ? `group\u0000${c.group}` : c.id)

  const relations = board.relationships.filter((r) => blockOf.has(r.from) && blockOf.has(r.to))
  const fileOrder = new Map(cards.map((c, i) => [c.id, i]))
  const pairs = relations.map((r) => ({ from: r.from, to: r.to, label: narrowest(r.label) ?? MAX_WIDTH }))

  const members = new Map<string, string[]>()
  for (const c of cards) {
    const block = blockOf.get(c.id) as string
    if (block === c.id) continue
    const list = members.get(block)
    if (list) list.push(c.id)
    else members.set(block, [c.id])
  }
  const groups = new Map<string, { boxes: Box[]; edges: Edge[] }>()
  for (const [block, list] of members) {
    const inside = new Set(list)
    groups.set(block, {
      boxes: list.map((id) => ({ id, ...sizeOf(id) })),
      edges: oriented(
        pairs.filter((r) => inside.has(r.from) && inside.has(r.to)),
        fileOrder,
      ),
    })
  }
  const blockOrder = new Map<string, number>()
  for (const c of cards) {
    const block = blockOf.get(c.id) as string
    if (!blockOrder.has(block)) blockOrder.set(block, blockOrder.size)
  }
  const outerEdges = oriented(
    pairs.map((r) => ({ ...r, from: blockOf.get(r.from) as string, to: blockOf.get(r.to) as string })),
    blockOrder,
  )
  // Lines need tracks between the cards: the busier the board, the wider its gaps.
  const load = Math.ceil(Math.sqrt(relations.length) / 2)
  return { cards, sizeOf, blockOf, groups, outerEdges, load, inner: new Map(), lift, gaps: lift ? tightGaps(load) : roomyGaps(load), pad: groupPadding(board) }
}

function layoutOnce(prep: Prepared, groupAspect: number, mapAspect: number): { out: Record<string, Point>; width: number; height: number } {
  const { cards, sizeOf, blockOf } = prep
  const wrapped = Number.isFinite(mapAspect)

  // Inner pass: the members of each group.
  const inner = new Map<string, Placed>()
  for (const [block, { boxes, edges }] of prep.groups) {
    const aspect = groupAspect
    const key = `${block}|${aspect}|${wrapped}`
    let placed = prep.inner.get(key)
    if (!placed) {
      placed = flowAndPack(boxes, edges, { ...prep.gaps.inner, row: prep.gaps.row }, aspect, prep.gaps.member, false, { aspect, slack: wrapped ? 2.2 : Infinity }, prep.lift)
      prep.inner.set(key, placed)
    }
    inner.set(block, placed)
  }

  // Outer pass: one block per group, and each loose card.
  const blocks: Box[] = []
  const seen = new Set<string>()
  for (const c of cards) {
    const block = blockOf.get(c.id) as string
    if (seen.has(block)) continue
    seen.add(block)
    const placed = inner.get(block)
    blocks.push(
      placed
        ? { id: block, width: placed.width + prep.pad.side * 2, height: placed.height + prep.pad.top + prep.pad.bottom }
        : { id: block, ...sizeOf(c.id) },
    )
  }
  const outer = flowAndPack(blocks, prep.outerEdges, { ...prep.gaps.outer, row: prep.gaps.row }, wrapped ? mapAspect : PACK_ASPECT, prep.gaps.piece, true, { aspect: mapAspect, slack: wrapped ? FLOW_SLACK : Infinity }, prep.lift)

  const out: Record<string, Point> = {}
  for (const c of cards) {
    const block = blockOf.get(c.id) as string
    const origin = outer.at.get(block) ?? { x: 0, y: 0 }
    const placed = inner.get(block)
    const local = placed?.at.get(c.id)
    out[c.id] = local ? { x: origin.x + prep.pad.side + local.x, y: origin.y + prep.pad.top + local.y } : { x: origin.x, y: origin.y }
  }
  return { out, width: outer.width, height: outer.height }
}
