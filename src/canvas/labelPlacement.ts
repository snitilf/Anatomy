import type { Point } from '../overlay/types'
import type { Rect } from './routing'

export interface LabelSpot {
  x: number
  y: number
  /** Width of the pill. The text wraps inside it. */
  width: number
  lines: number
}

const CHAR_WIDTH = 6.4
const PAD_X = 10
const LINE_HEIGHT = 16
const PAD_Y = 3
/** Widest first. A label tries the wide pill and falls back to narrower, taller ones. */
const TIERS = [150, 116, 88]

export function pillHeight(lines: number): number {
  return lines * LINE_HEIGHT + PAD_Y * 2
}

/** Cards keep a quiet margin. Only the part where text sits counts as covered. */
export function textArea(card: Rect): Rect {
  return { x: card.x + 10, y: card.y + 8, width: card.width - 20, height: card.height - 34 }
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Estimates how the text wraps in a pill of the given outer width. */
export function wrap(text: string, outer: number): { lines: number; width: number } {
  const room = outer - PAD_X * 2
  let lines = 1
  let line = 0
  let widest = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.length * CHAR_WIDTH
    if (line === 0) line = w
    else if (line + CHAR_WIDTH + w <= room) line += CHAR_WIDTH + w
    else {
      widest = Math.max(widest, line)
      lines++
      line = w
    }
  }
  widest = Math.max(widest, line)
  return { lines, width: Math.min(outer, Math.ceil(widest) + PAD_X * 2 + 2) }
}

function inside(p: Point, r: Rect): boolean {
  return p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height
}

/**
 * Picks where a connection's label goes. It slides along the line, away from the middle,
 * until the pill covers no card text, no other pill, and no other line. A wide pill with
 * two lines is preferred. In a narrow gap it falls back to a narrower pill with more lines,
 * and beside the line when the line is too short to carry the pill without hiding its arrow.
 */
export function placeLabel(
  route: readonly Point[],
  text: string,
  cards: readonly Rect[],
  taken: readonly Rect[],
  otherLines: readonly Point[] = [],
): LabelSpot {
  const areas = cards.map(textArea)
  const last = route.length - 1
  const end = route[last] ?? { x: 0, y: 0 }
  const middle = route[Math.round(last / 2)] ?? { x: 0, y: 0 }
  let best: LabelSpot = { ...middle, width: TIERS[0] as number, lines: 1 }
  let bestCost = Infinity

  for (const tier of TIERS) {
    const size = wrap(text, tier)
    const height = pillHeight(size.lines)
    const tall = size.lines > 2 ? 400 : 0
    for (let k = 0; k <= 34; k++) {
      // 0.5, 0.52, 0.48, 0.54, ... but never right at the arrowheads.
      const along = Math.ceil(k / 2) * 0.02 * (k % 2 === 1 ? 1 : -1)
      const fraction = 0.5 + along
      if (fraction < 0.14 || fraction > 0.86) continue
      const index = Math.round(last * fraction)
      const p = route[index]
      const before = route[Math.max(0, index - 2)]
      const after = route[Math.min(last, index + 2)]
      if (!p || !before || !after) continue
      const tangent = Math.hypot(after.x - before.x, after.y - before.y) || 1
      const normal = { x: -(after.y - before.y) / tangent, y: (after.x - before.x) / tangent }
      const reach = Math.abs(normal.x) * (size.width / 2 + 8) + Math.abs(normal.y) * (height / 2 + 8)
      for (const side of [0, 1, -1]) {
        const c = { x: p.x + normal.x * reach * side, y: p.y + normal.y * reach * side }
        const box = { x: c.x - size.width / 2, y: c.y - height / 2, width: size.width, height }
        const arrow = { x: end.x - 14, y: end.y - 14, width: 28, height: 28 }
        const cost =
          areas.reduce((sum, a) => sum + overlap(box, a), 0) +
          taken.reduce((sum, t) => sum + overlap(box, t), 0) * 3 +
          otherLines.reduce((sum, q) => sum + (inside(q, box) ? 6 : 0), 0) +
          (overlap(box, arrow) > 0 ? 300 : 0) +
          (side === 0 ? 0 : 14) +
          tall +
          (size.lines - 1) * 10 +
          Math.abs(along) * 120
        if (cost < bestCost) {
          bestCost = cost
          best = { x: c.x, y: c.y, width: size.width, lines: size.lines }
        }
      }
    }
  }
  return best
}
