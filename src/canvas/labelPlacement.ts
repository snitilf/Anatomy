import { inflate, type Point, type Rect } from '../layout/geometry'

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
/** A label that needs three lines in the usual pill is tried in a wider one first. */
const WIDE = 200

export function pillHeight(lines: number): number {
  return lines * LINE_HEIGHT + PAD_Y * 2
}

/** A label never sits on a card: cards are sized to their text, so the whole card and a thin margin count as covered. */
export function textArea(card: Rect): Rect {
  return { x: card.x - 4, y: card.y - 4, width: card.width + 8, height: card.height + 8 }
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Rough width of one character at 12px: wide scripts and emoji take about twice a Latin letter. */
function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0
  return code >= 0x2e80 || code >= 0x1f000 ? CHAR_WIDTH * 1.9 : CHAR_WIDTH
}

/** A pill shows at most this many lines. The rest is cut with an ellipsis until the connection is selected. */
export const MAX_LINES = 3

/** Estimates how the text wraps in a pill of the given outer width. Long words break anywhere. */
export function wrap(text: string, outer: number): { lines: number; width: number } {
  const room = outer - PAD_X * 2
  let lines = 1
  let line = 0
  let widest = 0
  const put = (w: number) => {
    if (line === 0) line = w
    else if (line + CHAR_WIDTH + w <= room) line += CHAR_WIDTH + w
    else {
      widest = Math.max(widest, line)
      lines++
      line = w
    }
  }
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const chars = [...word]
    const w = chars.reduce((sum, c) => sum + charWidth(c), 0)
    if (w <= room) {
      put(w)
      continue
    }
    // Too long for any line: it fills lines of its own, one slice at a time.
    let slice = 0
    for (const c of chars) {
      const cw = charWidth(c)
      if (slice + cw > room) {
        put(slice)
        line = room
        slice = 0
      }
      slice += cw
    }
    put(slice)
  }
  widest = Math.max(widest, line)
  return { lines: Math.min(lines, MAX_LINES), width: Math.min(outer, Math.ceil(widest) + PAD_X * 2 + 2) }
}

const CELL = 64
const cellKey = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768)

/**
 * The sampled points of every drawn line, bucketed once per build.
 * A label asks for the points inside its box and only the buckets under that box are read.
 */
export class PointIndex {
  private readonly cells = new Map<number, number[]>()

  /** Adds the points of one line. `owner` lets a label skip its own line. */
  add(owner: number, points: readonly Point[]): void {
    for (const p of points) {
      const key = cellKey(Math.floor(p.x / CELL), Math.floor(p.y / CELL))
      const cell = this.cells.get(key)
      if (cell) cell.push(p.x, p.y, owner)
      else this.cells.set(key, [p.x, p.y, owner])
    }
  }

  /** How many points of lines other than `skip` lie strictly inside the box. */
  countInside(box: Rect, skip: number): number {
    const right = box.x + box.width
    const bottom = box.y + box.height
    let count = 0
    for (let cx = Math.floor(box.x / CELL); cx <= Math.floor(right / CELL); cx++) {
      for (let cy = Math.floor(box.y / CELL); cy <= Math.floor(bottom / CELL); cy++) {
        const cell = this.cells.get(cellKey(cx, cy))
        if (!cell) continue
        for (let i = 0; i < cell.length; i += 3) {
          const x = cell[i] as number
          const y = cell[i + 1] as number
          if (x > box.x && x < right && y > box.y && y < bottom && cell[i + 2] !== skip) count++
        }
      }
    }
    return count
  }
}

/** A label never reaches further than this from the line it sits on. */
const REACH = 260

function near(r: Rect, around: Rect): boolean {
  return r.x < around.x + around.width && r.x + r.width > around.x && r.y < around.y + around.height && r.y + r.height > around.y
}

/**
 * Picks where a connection's label goes. It slides along the line, away from the middle,
 * until the pill covers no card text, no other pill, and no other line. A wide pill with
 * two lines is preferred. In a narrow gap it falls back to a narrower pill with more lines,
 * and beside the line when the line is too short to carry the pill without hiding its arrow.
 *
 * `otherLines` is the points of the other lines. Pass a `PointIndex` built once per build and
 * the label's own line number in `own`, or a plain list of points.
 */
export function placeLabel(
  route: readonly Point[],
  text: string,
  cards: readonly Rect[],
  taken: readonly Rect[],
  otherLines: readonly Point[] | PointIndex = [],
  own = -1,
): LabelSpot {
  const last = route.length - 1
  const end = route[last] ?? { x: 0, y: 0 }
  const middle = route[Math.round(last / 2)] ?? { x: 0, y: 0 }
  let best: LabelSpot = { ...middle, width: TIERS[0] as number, lines: 1 }
  let bestCost = Infinity

  // Only cards, pills, and lines near this line can change the cost.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of route) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const around: Rect = { x: minX - REACH, y: minY - REACH, width: maxX - minX + REACH * 2, height: maxY - minY + REACH * 2 }
  const areas = cards.map(textArea).filter((a) => near(a, around))
  const pills = taken.filter((t) => near(t, around)).map((t) => inflate(t, 3))
  const raw = taken.filter((t) => near(t, around))
  let lines: PointIndex
  if (otherLines instanceof PointIndex) lines = otherLines
  else {
    lines = new PointIndex()
    // Owner -2 is never skipped, so every point of a plain list counts.
    lines.add(-2, otherLines)
  }

  const tiers = wrap(text, TIERS[0] as number).lines >= MAX_LINES ? [WIDE, ...TIERS] : TIERS
  for (const tier of tiers) {
    const size = wrap(text, tier)
    const height = pillHeight(size.lines)
    const tall = size.lines > 2 ? 40 : 0
    for (let k = 0; k <= 34; k++) {
      // 0.5, 0.52, 0.48, 0.54, ... but never right at the arrowheads.
      const along = Math.ceil(k / 2) * 0.02 * (k % 2 === 1 ? 1 : -1)
      const fraction = 0.5 + along
      if (fraction < 0.12 || fraction > 0.88) continue
      const at = Math.round(last * fraction)
      const p = route[at]
      const before = route[Math.max(0, at - 2)]
      const after = route[Math.min(last, at + 2)]
      if (!p || !before || !after) continue
      const tangent = Math.hypot(after.x - before.x, after.y - before.y) || 1
      const normal = { x: -(after.y - before.y) / tangent, y: (after.x - before.x) / tangent }
      const reach = Math.abs(normal.x) * (size.width / 2 + 8) + Math.abs(normal.y) * (height / 2 + 8)
      for (const side of [0, 1, -1]) {
        // Costs only grow as terms are added, so a candidate stops as soon as it cannot beat the best.
        const fixed = (side === 0 ? 0 : 24) + tall + (size.lines - 1) * 10 + Math.abs(along) * 120
        if (fixed >= bestCost) continue
        const c = { x: p.x + normal.x * reach * side, y: p.y + normal.y * reach * side }
        const box = { x: c.x - size.width / 2, y: c.y - height / 2, width: size.width, height }
        let cost = 0
        for (const a of areas) cost += overlap(box, a)
        if (cost + fixed >= bestCost) continue
        // Two pills must never touch. Sliding along the line is cheap, sharing space is not.
        for (let i = 0; i < pills.length; i++) {
          if (overlap(box, pills[i] as Rect) > 0) cost += 5000 + overlap(box, raw[i] as Rect)
        }
        if (cost + fixed >= bestCost) continue
        cost += lines.countInside(box, own) * 10
        const arrow = { x: end.x - 14, y: end.y - 14, width: 28, height: 28 }
        if (overlap(box, arrow) > 0) cost += 300
        cost += fixed
        if (cost < bestCost) {
          bestCost = cost
          best = { x: c.x, y: c.y, width: size.width, lines: size.lines }
          if (cost === 0) return best
        }
      }
    }
  }
  return best
}
