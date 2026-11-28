import type { Board } from '../board/schema'
import { narrowest } from '../canvas/labelPlacement'
import { measuringByTable } from '../canvas/textMeasure'
import { inflate, overlaps, type Point, type Rect, type Size } from './geometry'
import { groupAreas, groupPadding } from './groupArea'
import { settleMoves } from './groups'

/** The clear room a card that a revision adds keeps from every other card: one track of lines and its margins. */
const CLEAR = 48
/** Between a group area and a card or area outside it. The same as `GROUP_GAP` in `groups.ts`. */
const GROUP_GAP = 24
/** Between a new card and its neighbor: along the flow, before the room for the label of the line between them, and across it. */
const COLUMN_GAP = 64
const ROW_GAP = 64
/** What a gap holds besides the label of its line. The same as `LABEL_ROOM` in `autoLayout.ts`. */
const LABEL_ROOM = 64
const MAX_COLUMN_GAP = 400
/** How far a card beside its neighbor may sit higher or lower than it, in steps of the grid. */
const NUDGES = [16, 32, 48, 64]
/** How many steps out from its neighbor a new card looks for room, in each direction. */
const REACH = 6
/** A spot against the flow (left of the card it comes from, or right of the card it goes to) is taken only when nothing near is free. */
const AGAINST_FLOW = 1000
/**
 * A spot above the card a line comes from, or below the card it goes to, reads against a group that runs down. It costs more
 * than the widest column gap, so a free spot along the flow beside the neighbor always wins, but less than a spot far away.
 */
const UP_THE_FLOW = 400
/** A spot in the same column as a neighbor it is joined to reads as a step down the flow, so a spot along the flow wins when it is near. */
const ACROSS_FLOW = 200

const snap = (v: number) => Math.round(v / 8) * 8
const centerOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}

interface Anchor {
  id: string
  /** `after`: the anchor's line runs to the new card, so the card reads after it. `before`: the other way. */
  flow?: 'after' | 'before'
  label?: string
}

/**
 * Places the cards a revision added, one at a time, next to a neighbor already on the map: a part it is joined to, in its
 * own group first, or else a part of its group. The card takes the nearest free spot along the flow, so a card a line runs
 * to sits to the right of where the line starts. A spot is free when the card keeps clear of every card and of `keepOut`
 * (the places the removed parts had), stays out of other groups' areas, and its own group's area, grown to take it in,
 * covers no card or area that it did not cover before. Cards already placed stay, unless a card has to make room.
 * A card of a group with no free spot nearby makes room in its group, and the cards it covers step aside (`makeRoom`).
 * A card with no neighbor on the map goes to the right of everything. Returns the top-left corner of each card placed,
 * and of each card that stepped aside.
 */
export function placeBeside(board: Board, placed: Readonly<Record<string, Rect>>, pending: readonly string[], sizeOf: (id: string) => Size, keepOut: readonly Rect[] = []): Record<string, Point> {
  return measuringByTable(() => place(board, placed, pending, sizeOf, keepOut))
}

function place(board: Board, placed: Readonly<Record<string, Rect>>, pending: readonly string[], sizeOf: (id: string) => Size, keepOut: readonly Rect[]): Record<string, Point> {
  const rects: Record<string, Rect> = { ...placed }
  const groupOf = new Map(board.components.map((c) => [c.id, c.group]))
  const pad = groupPadding(board)
  const out: Record<string, Point> = {}

  const lastMember = (id: string): Anchor | undefined => {
    const group = groupOf.get(id)
    const mates = board.components.filter((c) => c.id !== id && group !== undefined && c.group === group && rects[c.id])
    const last = mates[mates.length - 1]
    return last ? { id: last.id } : undefined
  }

  const anchorsOf = (id: string): Anchor[] => {
    const group = groupOf.get(id)
    const joined: Anchor[] = []
    for (const r of board.relationships) {
      if (r.from === r.to) continue
      if (r.to === id && rects[r.from]) joined.push({ id: r.from, flow: 'after', label: r.label })
      else if (r.from === id && rects[r.to]) joined.push({ id: r.to, flow: 'before', label: r.label })
    }
    const sameGroup = (a: Anchor) => group !== undefined && groupOf.get(a.id) === group
    const ordered = [...joined.filter(sameGroup), ...joined.filter((a) => !sameGroup(a))]
    if (ordered.length > 0) return ordered.slice(0, 3)
    const mate = lastMember(id)
    return mate ? [mate] : []
  }

  /** Whether a card of `id` fits at `r`. With `alone`, only the cards and the removed places count, not the group areas. */
  const free = (id: string, r: Rect, alone = false): boolean => {
    const room = inflate(r, CLEAR / 2)
    for (const [other, o] of Object.entries(rects)) if (other !== id && overlaps(room, inflate(o, CLEAR / 2))) return false
    for (const o of keepOut) if (overlaps(room, inflate(o, CLEAR / 2))) return false
    if (alone) return true
    const group = groupOf.get(id)
    const areas = groupAreas(board, rects)
    const near = inflate(r, GROUP_GAP)
    for (const [g, area] of Object.entries(areas)) if (g !== group && overlaps(near, area)) return false
    if (group === undefined) return true
    const was = areas[group]
    const own = { x: r.x - pad.side, y: r.y - pad.top, width: r.width + pad.side * 2, height: r.height + pad.top + pad.bottom }
    const grown = inflate(was ? union(was, own) : own, GROUP_GAP / 2)
    for (const [other, o] of Object.entries(rects)) {
      if (other === id || groupOf.get(other) === group) continue
      if (overlaps(grown, o) && !(was && overlaps(was, o))) return false
    }
    for (const [g, area] of Object.entries(areas)) if (g !== group && overlaps(grown, area) && !(was && overlaps(was, area))) return false
    return true
  }

  /** The spots beside an anchor, the best first. */
  const spotsBeside = (size: Size, anchor: Anchor): Rect[] => {
    const a = rects[anchor.id]
    if (!a) return []
    const label = anchor.label !== undefined ? (narrowest(anchor.label) ?? 0) : 0
    const column = snap(Math.min(MAX_COLUMN_GAP, Math.max(COLUMN_GAP, label + LABEL_ROOM)))
    const xs = [a.x]
    // Beside the neighbor, a card may sit a little higher or lower, so a gap that is a few units short still takes it.
    const ys = [a.y, ...NUDGES.flatMap((d) => [a.y - d, a.y + d])]
    for (let i = 0; i <= REACH; i++) {
      xs.push(a.x + a.width + column + i * (size.width + COLUMN_GAP), a.x - column - size.width - i * (size.width + COLUMN_GAP))
      ys.push(a.y + a.height + ROW_GAP + i * (size.height + ROW_GAP), a.y - ROW_GAP - size.height - i * (size.height + ROW_GAP))
    }
    const from = centerOf(a)
    const spots: { r: Rect; cost: number }[] = []
    for (const x of xs) {
      for (const y of ys) {
        if (x === a.x && y === a.y) continue
        const r = { x, y, ...size }
        const c = centerOf(r)
        let cost = Math.hypot(c.x - from.x, c.y - from.y)
        if (anchor.flow === 'after' && r.x + r.width <= a.x) cost += AGAINST_FLOW
        if (anchor.flow === 'before' && r.x >= a.x + a.width) cost += AGAINST_FLOW
        // A group can read down as well as across: a card a line runs to never sits above where it starts, nor the other way.
        if (anchor.flow === 'after' && r.y + r.height <= a.y) cost += UP_THE_FLOW
        if (anchor.flow === 'before' && r.y >= a.y + a.height) cost += UP_THE_FLOW
        if (anchor.flow !== undefined && x === a.x) cost += ACROSS_FLOW
        spots.push({ r, cost })
      }
    }
    // Sorted by cost, then by the order they were made in, which is fixed.
    spots.sort((p, q) => p.cost - q.cost)
    return spots.map((s) => s.r)
  }

  /**
   * A card of a group with no free spot near its neighbors still joins its group: it takes the best spot beside a member
   * that is clear of cards, and the cards and groups its grown area now covers step aside as blocks, the way a drop
   * pushes them. Moving a few neighbors is better than an area drawn over another group (an exception to D144).
   */
  const makeRoom = (id: string, size: Size, anchor: Anchor): Rect | undefined => {
    const spots = spotsBeside(size, anchor)
    const r = spots.find((s) => free(id, s, true)) ?? spots[0]
    if (!r) return undefined
    rects[id] = r
    for (const [other, p] of Object.entries(settleMoves(board, rects, [id]))) {
      const was = rects[other]
      if (!was || other === id) continue
      rects[other] = { ...was, x: p.x, y: p.y }
      out[other] = { x: p.x, y: p.y }
    }
    return r
  }

  /** To the right of everything on the map, top first. */
  const atTheEnd = (id: string, size: Size): Rect => {
    const all = [...Object.values(rects), ...keepOut]
    const right = all.length > 0 ? Math.max(...all.map((r) => r.x + r.width)) : 0
    const top = all.length > 0 ? Math.min(...all.map((r) => r.y)) : 0
    const x = snap(right + COLUMN_GAP * 2)
    for (let j = 0; ; j++) {
      const r = { x, y: snap(top + j * (size.height + ROW_GAP)), ...size }
      if (free(id, r, true) || j > 200) return r
    }
  }

  const left = [...pending]
  while (left.length > 0) {
    // A card with a neighbor on the map goes first, so a chain of new cards grows out from the cards that were there.
    const next = Math.max(0, left.findIndex((id) => anchorsOf(id).length > 0))
    const id = left.splice(next, 1)[0] as string
    const size = sizeOf(id)
    const anchors = anchorsOf(id)
    let spot: Rect | undefined
    for (const anchor of anchors) {
      spot = spotsBeside(size, anchor).find((r) => free(id, r))
      if (spot) break
    }
    const group = groupOf.get(id)
    const member = group !== undefined ? (anchors.find((a) => groupOf.get(a.id) === group) ?? lastMember(id)) : undefined
    const r = spot ?? (member ? makeRoom(id, size, member) : undefined) ?? atTheEnd(id, size)
    rects[id] = r
    out[id] = { x: r.x, y: r.y }
  }
  return out
}
