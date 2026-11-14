import { Graph, layout } from '@dagrejs/dagre'
import type { Board } from '../board/schema'
import type { Point, Size } from './geometry'

/** Room inside a group area around its cards. The label sits in the top band. */
export const GROUP_PADDING = { side: 24, top: 46, bottom: 24 } as const

/** Between cards in one group: across the flow, and between columns. A column gap has room for three tracks of lines. */
const INNER = { nodesep: 32, ranksep: 96 }
/** Between group areas and loose cards. */
const OUTER = { nodesep: 64, ranksep: 128 }
/** Between pieces that no connection joins: on the map, and inside a group. */
const PIECE_GAP = 96
const MEMBER_GAP = 48
/** Unconnected pieces are packed in rows toward this width to height ratio. A group is packed narrower than the map. */
const MAP_ASPECT = 1.6
const GROUP_ASPECT = 1.1

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

/** A layered left-to-right layout of one connected piece. Dagre returns centers; this returns top-left corners from zero. */
function flow(boxes: readonly Box[], edges: readonly Edge[], spacing: { nodesep: number; ranksep: number }): Placed {
  if (boxes.length === 1) {
    const only = boxes[0] as Box
    return { at: new Map([[only.id, { x: 0, y: 0 }]]), width: only.width, height: only.height }
  }
  const g = new Graph({ multigraph: true })
  g.setGraph({ rankdir: 'LR', acyclicer: 'greedy', ...spacing })
  g.setDefaultEdgeLabel(() => ({}))
  for (const b of boxes) g.setNode(b.id, { width: b.width, height: b.height })
  edges.forEach((e, i) => {
    if (e.from !== e.to) g.setEdge(e.from, e.to, { weight: e.weight, minlen: 1 }, String(i))
  })
  layout(g)
  const raw = boxes.map((b) => {
    const n = g.node(b.id) as { x: number; y: number }
    return { id: b.id, x: n.x - b.width / 2, y: n.y - b.height / 2, width: b.width, height: b.height }
  })
  const minX = Math.min(...raw.map((r) => r.x))
  const minY = Math.min(...raw.map((r) => r.y))
  const at = new Map(raw.map((r) => [r.id, { x: Math.round(r.x - minX), y: Math.round(r.y - minY) }]))
  const width = Math.max(...raw.map((r) => r.x + r.width)) - minX
  const height = Math.max(...raw.map((r) => r.y + r.height)) - minY
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
 */
function oriented(pairs: readonly { from: string; to: string }[], order: ReadonlyMap<string, number>): Edge[] {
  const out = new Map<string, Edge & { back: number }>()
  for (const p of pairs) {
    if (p.from === p.to) continue
    const forward = (order.get(p.from) ?? 0) <= (order.get(p.to) ?? 0)
    const [a, b] = forward ? [p.from, p.to] : [p.to, p.from]
    const key = `${a}\u0000${b}`
    const e = out.get(key) ?? { from: a, to: b, weight: 0, back: 0 }
    if (forward) e.weight++
    else e.back++
    out.set(key, e)
  }
  return [...out.values()].map((e) => (e.weight === 0 ? { from: e.to, to: e.from, weight: e.back } : { from: e.from, to: e.to, weight: e.weight + e.back }))
}

/**
 * A layered left-to-right layout of the cards, following the connections. It runs in two passes: the members of each
 * group are laid out on their own, then each group is one block among the loose cards. Pieces that no connection joins
 * are packed in rows. The same board always gives the same result. Returns the top-left corner of each card.
 *
 * Only the cards in `ids` are placed, and only the connections between them count. All cards when it is left out.
 */
export function autoLayout(board: Board, sizeOf: (id: string) => Size, ids?: ReadonlySet<string>): Record<string, Point> {
  const cards = board.components.filter((c) => !ids || ids.has(c.id))
  if (cards.length === 0) return {}
  const groupIds = new Set(board.groups.map((g) => g.id))
  const blockOf = new Map<string, string>()
  for (const c of cards) blockOf.set(c.id, c.group !== undefined && groupIds.has(c.group) ? `group\u0000${c.group}` : c.id)

  const relations = board.relationships.filter((r) => blockOf.has(r.from) && blockOf.has(r.to))
  const fileOrder = new Map(cards.map((c, i) => [c.id, i]))

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
      relations.filter((r) => inside.has(r.from) && inside.has(r.to)),
      fileOrder,
    )
    inner.set(block, flowAndPack(boxes, edges, INNER, GROUP_ASPECT, MEMBER_GAP, false))
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
    relations.map((r) => ({ from: blockOf.get(r.from) as string, to: blockOf.get(r.to) as string })),
    blockOrder,
  )
  const outer = flowAndPack(blocks, outerEdges, OUTER, MAP_ASPECT, PIECE_GAP, true)

  const out: Record<string, Point> = {}
  for (const c of cards) {
    const block = blockOf.get(c.id) as string
    const origin = outer.at.get(block) ?? { x: 0, y: 0 }
    const placed = inner.get(block)
    const local = placed?.at.get(c.id)
    out[c.id] = local ? { x: origin.x + GROUP_PADDING.side + local.x, y: origin.y + GROUP_PADDING.top + local.y } : { x: origin.x, y: origin.y }
  }
  return out
}
