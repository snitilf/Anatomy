import { Graph, layout } from '@dagrejs/dagre'
import type { Board } from '../board/schema'
import { MAX_WIDTH, wrap } from '../canvas/labelPlacement'
import type { Point, Size } from './geometry'

/** Room inside a group area around its cards. The label sits in the top band. */
export const GROUP_PADDING = { side: 24, top: 46, bottom: 24 } as const

/**
 * Between cards in one group: across the flow, and between columns. A gap between two stacked cards holds a track of
 * lines, so it is never narrower than one track and the room that keeps the line off both cards.
 */
const INNER = { nodesep: 48, ranksep: 96 }
/** Between group areas and loose cards. */
const OUTER = { nodesep: 64, ranksep: 128 }
/** Between pieces that no connection joins: on the map, and inside a group. */
const PIECE_GAP = 96
const MEMBER_GAP = 48
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

/** The room a gap needs to carry this many lines on tracks, with a track to spare for the grid they sit on. */
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
    const want = Math.min(Math.max(roomFor(cols.crossing[k] as number), (cols.labels[k] as number) + LABEL_ROOM), 400)
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
function wrapColumns(cols: Columns, aspect: number, slack: number): void {
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
  const gapAt = (start: number) => Math.max(96, roomFor(cols.crossing[start - 1] as number))
  let choice: { starts: number[]; score: number } | undefined
  for (let rows = 1; rows <= Math.min(count, 6); rows++) {
    const starts = splitColumns(widths, rows)
    if (new Set(starts).size !== starts.length) continue
    let width = 0
    let height = 0
    starts.forEach((s, r) => {
      const slice = sliceOf(starts, r)
      width = Math.max(width, right(slice[slice.length - 1] as Spot[]) - left(slice[0] as Spot[]))
      height += heightOf(slice.flat()) + (r > 0 ? gapAt(s) : 0)
    })
    const score = Math.abs(Math.log(width / height / aspect)) + (rows - 1) * 0.04
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

/** The layers dagre found for the layout in progress, by input. The shapes tried for one board share them. */
let dagreMemo: Map<string, Spot[]> | undefined

/** A layered left-to-right layout of one connected piece. Dagre returns centers; this returns top-left corners from zero. */
function flow(boxes: readonly Box[], edges: readonly Edge[], spacing: { nodesep: number; ranksep: number }, aspect: number, slack: number): Placed {
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
  wrapColumns(cols, aspect, slack)
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
  spacing: { nodesep: number; ranksep: number },
  aspect: number,
  gap: number,
  largestFirst: boolean,
  wrap: { aspect: number; slack: number },
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
  return { at, width, height }
}

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

/** Lighter than any one connection, so ranking gives up this edge first. */
const LOOP_WEIGHT = 0.1

/** The shapes tried for a layout: the ratio a group is packed toward, and the ratio of the whole. */
const GROUP_SHAPES = [1, 1.3, 1.6, 2, 2.4]
const MAP_SHAPES = [1.3, 1.6, 2]
/** What the picked layout is closest to. The map is wider than tall, and a card is wider than tall. */
const WANTED_ASPECT = 1.45
/** Unconnected pieces are packed in rows toward this ratio when the strips are not wrapped. */
const PACK_ASPECT = 1.6

/**
 * A layered left-to-right layout of the cards, following the connections. It runs in two passes: the members of each
 * group are laid out on their own, then each group is one block among the loose cards. Pieces that no connection joins
 * are packed in rows, and a strip much wider than the map is wrapped into rows. A few shapes are tried, and the one
 * whose whole is nearest the shape of the map wins, so fitting it to the screen leaves little of the map empty. A shape
 * in which more connections run backward than forward is never picked: the board reads left to right.
 * The same board always gives the same result. Returns the top-left corner of each card.
 *
 * Only the cards in `ids` are placed, and only the connections between them count. All cards when it is left out.
 */
export function autoLayout(board: Board, sizeOf: (id: string) => Size, ids?: ReadonlySet<string>): Record<string, Point> {
  const cards = board.components.filter((c) => !ids || ids.has(c.id))
  if (cards.length === 0) return {}
  const relations = board.relationships.filter((r) => cards.some((c) => c.id === r.from) && cards.some((c) => c.id === r.to))
  const flowOf = (out: Record<string, Point>) => {
    let forward = 0
    let backward = 0
    for (const r of relations) {
      const a = out[r.from]
      const b = out[r.to]
      if (!a || !b) continue
      if (a.x < b.x) forward++
      else if (a.x > b.x) backward++
    }
    return backward <= forward
  }
  dagreMemo = new Map()
  try {
    // The layout with every strip kept whole is the one that always reads left to right, and the fallback.
    const plain = layoutOnce(board, sizeOf, cards, GROUP_SHAPES[0] as number, Infinity)
    let best = { out: plain.out, score: Infinity }
    for (const group of GROUP_SHAPES) {
      for (const map of [...MAP_SHAPES, Infinity]) {
        const { out, width, height } = group === GROUP_SHAPES[0] && map === Infinity ? plain : layoutOnce(board, sizeOf, cards, group, map)
        if (!flowOf(out)) continue
        const score = Math.abs(Math.log(width / height / WANTED_ASPECT)) + Math.log((width * height) / 1e6) * 0.05
        if (score < best.score - 1e-9) best = { out, score }
      }
    }
    return best.out
  } finally {
    dagreMemo = undefined
  }
}

function layoutOnce(board: Board, sizeOf: (id: string) => Size, cards: readonly Board['components'][number][], groupAspect: number, mapAspect: number): { out: Record<string, Point>; width: number; height: number } {
  const wrapped = Number.isFinite(mapAspect)
  const groupIds = new Set(board.groups.map((g) => g.id))
  const blockOf = new Map<string, string>()
  for (const c of cards) blockOf.set(c.id, c.group !== undefined && groupIds.has(c.group) ? `group\u0000${c.group}` : c.id)

  const relations = board.relationships.filter((r) => blockOf.has(r.from) && blockOf.has(r.to))
  const fileOrder = new Map(cards.map((c, i) => [c.id, i]))
  const pair = (r: { from: string; to: string; label: string }) => ({ from: r.from, to: r.to, label: wrap(r.label)?.width ?? MAX_WIDTH })
  // Lines need tracks between the cards: the busier the board, the wider its gaps.
  const load = Math.ceil(Math.sqrt(relations.length) / 2)

  // Inner pass: the members of each group.
  const members = new Map<string, string[]>()
  for (const c of cards) {
    const block = blockOf.get(c.id) as string
    if (block === c.id) continue
    const list = members.get(block)
    if (list) list.push(c.id)
    else members.set(block, [c.id])
  }
  const inner = new Map<string, Placed>()
  for (const [block, list] of members) {
    const inside = new Set(list)
    const boxes = list.map((id) => ({ id, ...sizeOf(id) }))
    const edges = oriented(
      relations.filter((r) => inside.has(r.from) && inside.has(r.to)).map(pair),
      fileOrder,
    )
    const spacing = { nodesep: Math.max(INNER.nodesep, roomFor(Math.ceil(load / 2))), ranksep: INNER.ranksep }
    inner.set(block, flowAndPack(boxes, edges, spacing, groupAspect, Math.max(MEMBER_GAP, roomFor(load)), false, { aspect: groupAspect, slack: wrapped ? 2.2 : Infinity }))
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
        ? { id: block, width: placed.width + GROUP_PADDING.side * 2, height: placed.height + GROUP_PADDING.top + GROUP_PADDING.bottom }
        : { id: block, ...sizeOf(c.id) },
    )
  }
  const blockOrder = new Map(blocks.map((b, i) => [b.id, i]))
  const outerEdges = oriented(
    relations.map((r) => ({ ...pair(r), from: blockOf.get(r.from) as string, to: blockOf.get(r.to) as string })),
    blockOrder,
  )
  const spacing = { nodesep: Math.max(OUTER.nodesep, roomFor(Math.ceil(load / 2))), ranksep: OUTER.ranksep }
  const outer = flowAndPack(blocks, outerEdges, spacing, wrapped ? mapAspect : PACK_ASPECT, Math.max(PIECE_GAP, roomFor(load)), true, { aspect: mapAspect, slack: wrapped ? FLOW_SLACK : Infinity })

  const out: Record<string, Point> = {}
  for (const c of cards) {
    const block = blockOf.get(c.id) as string
    const origin = outer.at.get(block) ?? { x: 0, y: 0 }
    const placed = inner.get(block)
    const local = placed?.at.get(c.id)
    out[c.id] = local ? { x: origin.x + GROUP_PADDING.side + local.x, y: origin.y + GROUP_PADDING.top + local.y } : { x: origin.x, y: origin.y }
  }
  return { out, width: outer.width, height: outer.height }
}
