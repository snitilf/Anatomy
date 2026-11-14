import { inflate, overlaps, type Point, type Rect } from './geometry'

/** Space left between a card and the card that pushed it. */
export const PUSH_GAP = 16
/** A push may push further cards, this many times over. What still overlaps after that stays. */
const PASSES = 3
/** Extra distance a push may take to keep a card inside its own group area, and out of another group's area. */
const GROUP_COST = 240
/** A spot on top of a card that is already settled is the last choice. */
const SETTLED_COST = 100_000

export interface PushOptions {
  /** The group of each card, if it has one. */
  groupOf?: (id: string) => string | undefined
  /** The area of each group before the push. */
  areas?: Readonly<Record<string, Rect>>
  gap?: number
}

const within = (outer: Rect, r: Rect) => r.x >= outer.x && r.y >= outer.y && r.x + r.width <= outer.x + outer.width && r.y + r.height <= outer.y + outer.height

/**
 * Moves cards out from under the pinned cards, each along the shorter way out, to `gap` away. A card that was pushed may push others
 * in the next pass. Pinned cards never move, and a pushed card avoids spots on top of cards that have already settled.
 * Returns the new top-left corner of every card that moved. Keys of `rects` set the order, so the result is stable.
 */
export function pushApart(rects: Readonly<Record<string, Rect>>, pinned: ReadonlySet<string>, options: PushOptions = {}): Record<string, Point> {
  const gap = options.gap ?? PUSH_GAP
  const current = new Map(Object.entries(rects).map(([id, r]) => [id, { ...r }]))
  const settled = new Set(pinned)
  const moves: Record<string, Point> = {}
  let pushers = [...pinned].filter((id) => current.has(id))

  const cost = (id: string, spot: Rect, distance: number): number => {
    let total = distance
    for (const other of settled) {
      if (other === id) continue
      const r = current.get(other)
      if (r && overlaps(inflate(spot, gap / 2 - 1), inflate(r, gap / 2 - 1))) total += SETTLED_COST
    }
    const group = options.groupOf?.(id)
    const areas = options.areas
    if (areas) {
      const own = group !== undefined ? areas[group] : undefined
      if (own && !within(own, spot)) total += GROUP_COST
      for (const [key, area] of Object.entries(areas)) if (key !== group && overlaps(area, spot)) total += GROUP_COST
    }
    return total
  }

  for (let pass = 0; pass < PASSES && pushers.length > 0; pass++) {
    const next: string[] = []
    for (const pusherId of pushers) {
      const p = current.get(pusherId)
      if (!p) continue
      for (const [id, r] of current) {
        if (settled.has(id) || !overlaps(p, r)) continue
        const ways: { dx: number; dy: number }[] = [
          { dx: p.x + p.width + gap - r.x, dy: 0 },
          { dx: p.x - gap - (r.x + r.width), dy: 0 },
          { dx: 0, dy: p.y + p.height + gap - r.y },
          { dx: 0, dy: p.y - gap - (r.y + r.height) },
        ]
        let best: { dx: number; dy: number; cost: number } | undefined
        for (const o of ways) {
          const c = cost(id, { ...r, x: r.x + o.dx, y: r.y + o.dy }, Math.abs(o.dx) + Math.abs(o.dy))
          if (!best || c < best.cost) best = { ...o, cost: c }
        }
        if (!best) continue
        r.x = Math.round(r.x + best.dx)
        r.y = Math.round(r.y + best.dy)
        moves[id] = { x: r.x, y: r.y }
        settled.add(id)
        next.push(id)
      }
    }
    pushers = next
  }
  return moves
}
