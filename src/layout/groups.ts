import type { Board } from '../board/schema'
import { groupAreas } from './groupArea'
import { inflate, overlaps, type Point, type Rect } from './geometry'
import { pushApart } from './push'

/** Space kept between two group areas, and between a group area and a card outside it. */
export const GROUP_GAP = 24
/** A drop may push cards this many rounds of pushes deep. */
const PUSH_ROUNDS = 4
/** A moved group may bump the next one, this many times over. */
const PASSES = 4
/** A way out that lands on another unit is the last choice. */
const LANDING_COST = 10_000

interface Unit {
  /** The cards that move together. */
  ids: string[]
  /** The area the unit takes: a group's box, or an ungrouped card's own rectangle. */
  area: Rect
  grouped: boolean
}

/**
 * After a drop or a resize: moves the other groups so that no two group areas overlap or come closer than `gap`, and so
 * that no card outside a group sits inside one. The groups of the pinned cards stay. Every other group moves as one unit,
 * all its cards by the same amount, along the shortest way out. A unit that moved may bump the next, a few times over.
 * Returns the new top-left corner of every card that moved. `rects` holds every card, proposed parts included.
 */
export function separateGroups(board: Board, rects: Readonly<Record<string, Rect>>, pinned: ReadonlySet<string>, gap = GROUP_GAP): Record<string, Point> {
  const areas = groupAreas(board, rects)
  const groupOf = new Map(board.components.map((c) => [c.id, c.group]))
  const units = new Map<string, Unit>()
  for (const [id, r] of Object.entries(rects)) {
    const g = groupOf.get(id)
    const area = g !== undefined ? areas[g] : undefined
    const key = area ? `g:${g}` : `c:${id}`
    const unit = units.get(key)
    if (unit) unit.ids.push(id)
    else units.set(key, { ids: [id], area: area ?? r, grouped: area !== undefined })
  }
  const settled = new Set<string>()
  for (const [key, unit] of units) if (unit.ids.some((id) => pinned.has(id))) settled.add(key)
  const moved = new Map<string, Point>()

  // Two cards outside any group only have to stay apart, which the push of a drop already does.
  const clashes = (a: Unit, b: Unit, at: Rect = b.area): boolean => {
    if (!a.grouped && !b.grouped) return overlaps(a.area, at)
    return overlaps(inflate(a.area, gap / 2), inflate(at, gap / 2))
  }

  for (let pass = 0; pass < PASSES; pass++) {
    let any = false
    for (const anchorKey of [...settled]) {
      const anchor = units.get(anchorKey) as Unit
      for (const [key, unit] of units) {
        if (settled.has(key) || !clashes(anchor, unit)) continue
        const room = anchor.grouped || unit.grouped ? gap : 0
        const a = anchor.area
        const u = unit.area
        const ways = [
          { dx: a.x + a.width + room - u.x, dy: 0 },
          { dx: a.x - room - (u.x + u.width), dy: 0 },
          { dx: 0, dy: a.y + a.height + room - u.y },
          { dx: 0, dy: a.y - room - (u.y + u.height) },
        ]
        let best: { dx: number; dy: number; cost: number } | undefined
        for (const way of ways) {
          const spot = { ...u, x: u.x + way.dx, y: u.y + way.dy }
          let cost = Math.abs(way.dx) + Math.abs(way.dy)
          for (const [otherKey, other] of units) if (otherKey !== key && otherKey !== anchorKey && clashes(other, unit, spot)) cost += settled.has(otherKey) ? LANDING_COST : LANDING_COST / 4
          if (!best || cost < best.cost) best = { ...way, cost }
        }
        if (!best) continue
        unit.area = { ...u, x: u.x + best.dx, y: u.y + best.dy }
        for (const id of unit.ids) {
          const was = moved.get(id) ?? { x: (rects[id] as Rect).x, y: (rects[id] as Rect).y }
          moved.set(id, { x: Math.round(was.x + best.dx), y: Math.round(was.y + best.dy) })
        }
        settled.add(key)
        any = true
      }
    }
    if (!any) break
  }
  return Object.fromEntries(moved)
}

/**
 * Everything a drop or a resize moves besides the cards in hand. Cards a held card covers are pushed aside only within
 * the same group, or among cards that have no group, so a group's own layout never changes because another group was
 * hit. A collision across groups is settled after that by `separateGroups`, which moves whole groups. One set of
 * positions, for one undo step.
 */
export function settleMoves(board: Board, rects: Readonly<Record<string, Rect>>, ids: readonly string[]): Record<string, Point> {
  const groupOf = new Map(board.components.map((c) => [c.id, c.group]))
  const pinned = new Set(ids)
  const lanes = new Map<string, string[]>()
  for (const id of Object.keys(rects)) {
    const lane = groupOf.get(id) ?? ''
    const list = lanes.get(lane)
    if (list) list.push(id)
    else lanes.set(lane, [id])
  }
  // A push reaches only a few cards deep. A card it moved last may still cover another, so the push goes on from every
  // card that moved, until nothing is covered.
  const aside: Record<string, Point> = {}
  const pushed: Record<string, Rect> = { ...rects }
  for (const members of lanes.values()) {
    const pins = new Set(members.filter((id) => pinned.has(id)))
    if (pins.size === 0) continue
    for (let round = 0; round < PUSH_ROUNDS; round++) {
      const lane = Object.fromEntries(members.map((id) => [id, pushed[id] as Rect]))
      const moves = pushApart(lane, pins)
      const moved = Object.keys(moves)
      if (moved.length === 0) break
      for (const id of moved) {
        pushed[id] = { ...(pushed[id] as Rect), ...(moves[id] as Point) }
        aside[id] = moves[id] as Point
        pins.add(id)
      }
    }
  }
  // A pushed card is an anchor too: a group it landed on or beside gives way to it.
  return { ...aside, ...separateGroups(board, pushed, new Set([...pinned, ...Object.keys(aside)])) }
}
