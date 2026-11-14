import type { Rect } from '../layout/geometry'

/** Snapping reaches this far, in screen pixels. */
export const SNAP_PX = 6

/** A line the held card lines up with: across the map at `at`, drawn from `from` to `to` along the other axis. */
export interface Guide {
  at: number
  from: number
  to: number
}

interface Target {
  value: number
  /** The card the value belongs to, for the length of the guide. */
  card: Rect
}

const lowerBound = (list: readonly Target[], value: number): number => {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((list[mid] as Target).value < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * The edges and middles of the other cards in view, sorted once when a drag or resize starts. Each frame asks for the
 * nearest one with a binary search, so the cost per frame does not grow with the board.
 */
export class SnapTargets {
  private readonly xs: Target[]
  private readonly ys: Target[]

  constructor(cards: readonly Rect[]) {
    this.xs = cards.flatMap((card) => [card.x, card.x + card.width / 2, card.x + card.width].map((value) => ({ value, card }))).sort((a, b) => a.value - b.value)
    this.ys = cards.flatMap((card) => [card.y, card.y + card.height / 2, card.y + card.height].map((value) => ({ value, card }))).sort((a, b) => a.value - b.value)
  }

  /** The nearest target to any of the values, within reach. `shift` moves the value onto it. */
  private nearest(list: readonly Target[], values: readonly number[], reach: number): { shift: number; target: Target } | undefined {
    let best: { shift: number; target: Target } | undefined
    for (const value of values) {
      const i = lowerBound(list, value)
      for (const target of [list[i - 1], list[i]]) {
        if (!target) continue
        const shift = target.value - value
        if (Math.abs(shift) <= reach && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, target }
      }
    }
    return best
  }

  /** Lines a moving card up with its neighbors: its left, middle, or right, and its top, middle, or bottom. */
  move(card: Rect, reach: number): { x: number; y: number; vertical?: Guide; horizontal?: Guide } {
    const sx = this.nearest(this.xs, [card.x, card.x + card.width / 2, card.x + card.width], reach)
    const sy = this.nearest(this.ys, [card.y, card.y + card.height / 2, card.y + card.height], reach)
    const x = card.x + (sx?.shift ?? 0)
    const y = card.y + (sy?.shift ?? 0)
    return { x, y, ...guides({ ...card, x, y }, sx?.target, sy?.target) }
  }

  /** Lines up the right and bottom edges of a card being resized from its bottom-right corner. */
  resize(card: Rect, reach: number): { width: number; height: number; vertical?: Guide; horizontal?: Guide } {
    const sx = this.nearest(this.xs, [card.x + card.width], reach)
    const sy = this.nearest(this.ys, [card.y + card.height], reach)
    const width = card.width + (sx?.shift ?? 0)
    const height = card.height + (sy?.shift ?? 0)
    return { width, height, ...guides({ ...card, width, height }, sx?.target, sy?.target) }
  }
}

function guides(card: Rect, x: Target | undefined, y: Target | undefined): { vertical?: Guide; horizontal?: Guide } {
  const out: { vertical?: Guide; horizontal?: Guide } = {}
  if (x) out.vertical = { at: x.value, from: Math.min(card.y, x.card.y), to: Math.max(card.y + card.height, x.card.y + x.card.height) }
  if (y) out.horizontal = { at: y.value, from: Math.min(card.x, y.card.x), to: Math.max(card.x + card.width, y.card.x + y.card.width) }
  return out
}

/** The cards whose box touches the visible part of the map. */
export function inView(cards: Iterable<Rect>, viewport: { x: number; y: number; zoom: number }, map: { width: number; height: number }): Rect[] {
  const left = -viewport.x / viewport.zoom
  const top = -viewport.y / viewport.zoom
  const right = left + map.width / viewport.zoom
  const bottom = top + map.height / viewport.zoom
  const out: Rect[] = []
  for (const c of cards) if (c.x < right && c.x + c.width > left && c.y < bottom && c.y + c.height > top) out.push(c)
  return out
}
