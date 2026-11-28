import type { Board } from '../board/schema'
import { groupAreas, placeCards } from '../layout/cards'
import { contains, overlaps, type Point, type Rect } from '../layout/geometry'
import { pushApart } from '../layout/push'
import type { Layer, Mark, MarkEnd, Proposal } from './model'

/**
 * The layer with every card held where it is drawn now. The first mark or proposed part calls it, since those are stored in
 * board coordinates: from then on a change to the layout never slides a card out from under them. A layer that already
 * holds its cards is returned as it is.
 */
export function holdPlaces(layer: Layer, board: Board): Layer {
  return layer.placed ? layer : { ...layer, placed: placeCards(board, layer) }
}

/**
 * A new revision of the board opens over this layer, which belongs to `previous`. Every card keeps the place it had, the
 * cards the revision added go beside a neighbor, and the parts it removed keep their places for their ghosts until the next
 * revision.
 */
export function placeRevision(layer: Layer, previous: Board, board: Board): Layer {
  const was = placeCards(previous, layer)
  const now = placeCards(board, { ...layer, placed: was })
  const kept = new Set(board.components.map((c) => c.id))
  const removed = Object.fromEntries(Object.entries(was).filter(([id]) => !kept.has(id)))
  return { ...layer, placed: { ...now, ...removed } }
}

/** The box a mark covers. An arrow has none: its ends are placed one by one. */
function boxOf(mark: Mark): Rect | undefined {
  if (mark.kind === 'arrow') return undefined
  if (mark.kind !== 'stroke') return { x: mark.x, y: mark.y, width: mark.width, height: mark.height }
  const xs = mark.points.map((p) => p.x)
  const ys = mark.points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

const area = (a: Rect, b: Rect) => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** How far the card that a box covers most moved, or nothing when it covers no card. A line with no height still counts. */
function shiftUnder(box: Rect, before: Readonly<Record<string, Rect>>, after: Readonly<Record<string, Rect>>): Point | undefined {
  const probe = { ...box, width: Math.max(box.width, 1), height: Math.max(box.height, 1) }
  let best: { id: string; share: number } | undefined
  for (const [id, r] of Object.entries(before)) {
    if (!after[id] || !overlaps(probe, r)) continue
    const share = area(probe, r)
    if (!best || share > best.share) best = { id, share }
  }
  if (!best) return undefined
  const a = before[best.id] as Rect
  const b = after[best.id] as Rect
  return { x: b.x - a.x, y: b.y - a.y }
}

function shiftEnd(end: MarkEnd, before: Readonly<Record<string, Rect>>, after: Readonly<Record<string, Rect>>): MarkEnd {
  if (end.type !== 'point') return end
  const id = Object.keys(before).find((k) => after[k] && contains(before[k] as Rect, end))
  if (!id) return end
  return { type: 'point', x: end.x + (after[id] as Rect).x - (before[id] as Rect).x, y: end.y + (after[id] as Rect).y - (before[id] as Rect).y }
}

/** A mark over a card goes with that card. A mark that covers no card stays where it is. */
function follow(mark: Mark, before: Readonly<Record<string, Rect>>, after: Readonly<Record<string, Rect>>): Mark {
  if (mark.kind === 'arrow') {
    const from = shiftEnd(mark.from, before, after)
    const to = shiftEnd(mark.to, before, after)
    return from === mark.from && to === mark.to ? mark : { ...mark, from, to }
  }
  const shift = shiftUnder(boxOf(mark) as Rect, before, after)
  if (!shift || (shift.x === 0 && shift.y === 0)) return mark
  if (mark.kind === 'stroke') return { ...mark, points: mark.points.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })) }
  return { ...mark, x: mark.x + shift.x, y: mark.y + shift.y }
}

function followProposal(p: Proposal, before: Readonly<Record<string, Rect>>, after: Readonly<Record<string, Rect>>): Proposal {
  const shift = shiftUnder(p, before, after)
  return !shift || (shift.x === 0 && shift.y === 0) ? p : { ...p, x: p.x + shift.x, y: p.y + shift.y }
}

/**
 * Lays the board out again, as if it opened for the first time: the cards the user moved go back into the layout, and a
 * card the user resized keeps its size while the cards it covers step aside. A mark or proposed part over a card goes with
 * that card. The new places are held, and the places of removed parts go with them, so their ghosts leave the map.
 * Returns the layer itself when the board is laid out that way already.
 */
export function tidyLayout(layer: Layer, board: Board): Layer {
  const before = placeCards(board, layer)
  const after = placeCards(board, { positions: {}, sizes: layer.sizes })
  const resized = new Set(Object.keys(layer.sizes).filter((id) => after[id]))
  if (resized.size > 0) {
    const groupOf = new Map(board.components.map((c) => [c.id, c.group]))
    const pinned = new Set([...resized, ...board.components.filter((c) => c.position).map((c) => c.id)])
    for (const [id, p] of Object.entries(pushApart(after, pinned, { groupOf: (id) => groupOf.get(id), areas: groupAreas(board, after) }))) {
      const r = after[id]
      if (r) after[id] = { ...r, x: p.x, y: p.y }
    }
  }
  const ids = new Set(board.components.map((c) => c.id))
  const ghosts = Object.keys(layer.placed ?? {}).some((id) => !ids.has(id))
  const same = board.components.every((c) => {
    const a = before[c.id]
    const b = after[c.id]
    return a && b && a.x === b.x && a.y === b.y
  })
  if (same && !ghosts && Object.keys(layer.positions).length === 0) return layer
  return {
    ...layer,
    positions: {},
    placed: after,
    marks: layer.marks.map((m) => follow(m, before, after)),
    proposals: layer.proposals.map((p) => followProposal(p, before, after)),
  }
}
