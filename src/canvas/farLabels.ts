import type { Point, Rect } from '../layout/geometry'
import { drawnPoints, type Bundle } from './bundleRoutes'
import { textWidth } from './textMeasure'

/** Natural sizes, before the scale: a group name is 13px medium on a 20px line, a count chip 11px on 18px, a tile name 11px on 16px. */
const NAME_LINE = 20
const NAME_LIFT = 5
const NAME_MAX = 260
const CHIP_HEIGHT = 18

const touches = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** The width of a group's name and count at natural size, before any cut. */
const naturalWidth = (label: string, count: number) => (textWidth(label, 'title') * 13) / 12 + 6 + String(count).length * 8 + 4

/** A name stops this far short of the name of the next group to its right, at natural size. */
const NAME_GAP = 8

/**
 * How wide each group's name may be drawn, at natural size, before the scale. A name stops short of the next group to its
 * right whose name sits on the same line, so two names never run into each other; past that, a long name is cut with an
 * ellipsis at `NAME_MAX`.
 */
export function nameRoom(groups: readonly { id: string; area: Rect }[], scale: number): Map<string, number> {
  const band = (area: Rect) => ({ top: area.y - (NAME_LIFT + NAME_LINE) * scale, bottom: area.y })
  const out = new Map<string, number>()
  for (const g of groups) {
    let room = NAME_MAX
    const a = band(g.area)
    for (const h of groups) {
      if (h === g || h.area.x <= g.area.x) continue
      const b = band(h.area)
      if (b.top >= a.bottom || a.top >= b.bottom) continue
      room = Math.min(room, (h.area.x - g.area.x) / scale - NAME_GAP)
    }
    out.set(g.id, Math.max(0, room))
  }
  return out
}

/** Where a group's name goes in the far view, and how wide it may be at natural size. */
export interface FarName {
  rect: Rect
  room: number
  /** The name reaches into the top of its own block, so the part of it below the block's edge sits on the block's wash. */
  inside: boolean
  /** How far down the name the block's top edge runs, at natural size: the name is on the map's ground above it. */
  edge: number
  /** No free place was found: the name is left off the map and shows only while it has focus. */
  hidden: boolean
}

/**
 * A name keeps this far from a part, a line, or another name, at natural size: to its sides, and above and below, where
 * its 20px line already leaves room around 13px letters.
 */
const CLEAR_X = 4
const CLEAR_Y = 1
/** A name cut short keeps at least this much room at natural size: its count and a few letters. */
const NAME_MIN = 64
/** The step, at natural size, by which a name moves down from above its block into its top. */
const NAME_STEP = 2

/** The stretches of a horizontal band, from `top` to `bottom`, that the boxes and lines cover. */
function covered(top: number, bottom: number, boxes: readonly Rect[], lines: readonly { points: readonly Point[]; pad: number }[], padX: number, padY: number): [number, number][] {
  const out: [number, number][] = []
  for (const r of boxes) if (r.y < bottom + padY && r.y + r.height > top - padY) out.push([r.x - padX, r.x + r.width + padX])
  for (const line of lines) {
    const reach = line.pad + padY
    for (let i = 1; i < line.points.length; i++) {
      const p = line.points[i - 1] as Point
      const q = line.points[i] as Point
      const low = Math.max(top - reach, Math.min(p.y, q.y))
      const high = Math.min(bottom + reach, Math.max(p.y, q.y))
      if (low > high) continue
      // Only the piece of the run inside the band, which for a slanted piece of a rounded corner is shorter than the run.
      const at = (y: number) => (p.y === q.y ? [p.x, q.x] : [p.x + ((q.x - p.x) * (y - p.y)) / (q.y - p.y)])
      const xs = [...at(low), ...at(high)]
      out.push([Math.min(...xs) - line.pad - padX, Math.max(...xs) + line.pad + padX])
    }
  }
  return out
}

/**
 * The free stretch at least `need` wide that starts nearest `x`, between `lo` and `hi`, and how wide it is up to `end`.
 * A free stretch starts at `x` or just past something covered, or ends just before something covered or at `end`.
 * Undefined when there is none.
 */
function freeNear(stretches: readonly [number, number][], x: number, lo: number, hi: number, end: number, need: number): { x: number; width: number } | undefined {
  const starts = [x, end - need, ...stretches.flatMap(([a, b]) => [b, a - need])].filter((s) => s >= lo && s <= hi).sort((a, b) => Math.abs(a - x) - Math.abs(b - x))
  for (const at of starts) {
    if (stretches.some(([a, b]) => a < at + need && b > at)) continue
    const width = Math.min(end, ...stretches.filter(([a]) => a >= at + need).map(([a]) => a)) - at
    if (width >= need) return { x: at, width }
  }
  return undefined
}

/**
 * Where each group's name goes in the far view. It never covers a part, a bundled line, another block, or another name,
 * and never runs past the right edge of the frame, so it never runs off a fitted map. A name sits just above its block
 * when that is free. When it is not, the name moves along the block's width, then down onto the block's top edge and into
 * its top, and last just below the block. At least half of it lies over the block, so it reads as the block's. A place where
 * the whole name fits wins over one where it must be cut short; a cut name keeps its count and a few letters. A name
 * with no free place at all is left off the map, the way a count with no free place is.
 */
export function farNames(
  groups: readonly { id: string; area: Rect; label: string; count: number }[],
  tiles: readonly Rect[],
  frame: Rect,
  scale: number,
  bundles: readonly Pick<Bundle, 'points' | 'width'>[] = [],
): Map<string, FarName> {
  const room = nameRoom(groups, scale)
  const lines = bundles.map((b) => ({ points: drawnPoints(b.points), pad: (b.width / 2) * scale }))
  const line = NAME_LINE * scale
  const pad = CLEAR_X * scale
  const right = frame.x + frame.width
  const placed: Rect[] = []
  const out = new Map<string, FarName>()
  for (const g of groups) {
    const { x, y, width, height } = g.area
    const whole = naturalWidth(g.label, g.count)
    const blocks = [...groups.filter((h) => h !== g).map((h) => h.area), ...tiles, ...placed]
    // From just above the block down onto its edge and into its top, and then just below it.
    const above = y - (NAME_LIFT + NAME_LINE) * scale
    const tops = Array.from({ length: Math.floor((2 * NAME_LIFT + NAME_LINE) / NAME_STEP) + 1 }, (_, i) => above + i * NAME_STEP * scale)
    tops.push(y + height + NAME_LIFT * scale)
    const find = (need: number) => {
      // The room the name needs: all of it, or what a cut name keeps, and never more than the longest name.
      const want = Math.min(need, whole, NAME_MAX) * scale
      for (const top of tops) {
        // Above, the name stops short of the next group's name on the same line, as `nameRoom` says. When that leaves
        // less than it needs, the name looks lower down instead of being cut shorter.
        const cap = Math.min(top === above ? (room.get(g.id) ?? NAME_MAX) : NAME_MAX, whole) * scale
        if (cap < want) continue
        // The name reads as the block's: it starts at the block's left edge, or as near it as is free while half of it, or
        // of a block narrower than it, still lies over the block.
        const over = Math.min(want, width) / 2
        const free = freeNear(covered(top, top + line, blocks, lines, pad, CLEAR_Y * scale), x, Math.max(frame.x, x + over - want), x + width - over, right, want)
        if (free) return { top, x: free.x, width: Math.min(free.width, cap) }
      }
      return undefined
    }
    const spot = find(whole) ?? find(NAME_MIN)
    if (spot) {
      const rect = { x: spot.x, y: spot.top, width: spot.width, height: line }
      const edge = Math.max(0, (y - spot.top) / scale)
      placed.push(rect)
      out.set(g.id, { rect, room: spot.width / scale, inside: spot.top + line > y && spot.top < y + height, edge, hidden: false })
    } else {
      // Where it shows while it has focus: just above the block, from its left edge, as wide as a cut name at least.
      // It moves left, where it can, to end at the right edge of the frame.
      const fits = Math.min(whole, NAME_MAX, Math.max(NAME_MIN, (right - x) / scale))
      const at = Math.max(frame.x, Math.min(x, right - fits * scale))
      out.set(g.id, { rect: { x: at, y: above, width: fits * scale, height: line }, room: fits, inside: false, edge: NAME_LINE, hidden: true })
    }
  }
  return out
}

/** A far-view tile's name tag, at natural size: 12px medium on a 16px line, 8px and 3px of padding, a 1px border, 6px above the tile, and at most 240px wide. */
const TAG_LINE = 16
const TAG_PAD_X = 8
const TAG_PAD_Y = 3
const TAG_LIFT = 6
const TAG_MAX = 240

/**
 * The room the name tag of a tile takes above it in the far view, at this label scale: where `.tip` in
 * `CardNode.module.css` draws it while the tile is selected or lit by a walkthrough step.
 */
export function tagRect(tile: Rect, label: string, scale: number): Rect {
  const width = Math.min(TAG_MAX, textWidth(label, 'title') + 2 * TAG_PAD_X + 2) * scale
  const height = (TAG_LINE + 2 * TAG_PAD_Y + 2) * scale
  return { x: tile.x + tile.width / 2 - width / 2, y: tile.y - TAG_LIFT * scale - height, width, height }
}

/** The room the user's mark takes under the number of a count: one dash and dot, and the gap above it. */
export const YOURS_TICK = 6

/** Whether a bundle mixes the user's links with the agent's lines, so its count carries the user's mark. */
export const isMixed = (b: Pick<Bundle, 'mine' | 'yours'>) => b.yours > 0 && !b.mine

/** The width of a count on the board at scale 1: its digits and its padding. The user's mark sits under the number, within it. */
export const countWidth = (b: Pick<Bundle, 'count'>) => String(b.count).length * 7 + 12

/** The height of a count on the board at scale 1, taller by the user's mark on a mixed bundle. */
export const countHeight = (b: Pick<Bundle, 'mine' | 'yours'>) => CHIP_HEIGHT + (isMixed(b) ? YOURS_TICK : 0)

/**
 * Where the count of each bundle sits: on a straight run of its line, nearest the middle of the longest run, sliding
 * along it when a name or another count is in the way. A count with no free place is left out.
 */
export function placeCounts(bundles: readonly Bundle[], avoid: readonly Rect[], scale: number): Map<string, Point> {
  const taken: Rect[] = [...avoid]
  const out = new Map<string, Point>()
  for (const b of bundles) {
    if (b.count < 2) continue
    const width = countWidth(b) * scale
    const height = countHeight(b) * scale
    const runs = b.points
      .slice(1)
      .map((q, i) => [b.points[i] as Point, q] as const)
      .map(([p, q]) => ({ p, q, length: Math.abs(q.x - p.x) + Math.abs(q.y - p.y) }))
      .sort((r, s) => s.length - r.length)
    let found: Point | undefined
    for (const run of runs) {
      if (run.length < Math.min(width, height) * 1.2) continue
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
        const at = { x: run.p.x + (run.q.x - run.p.x) * t, y: run.p.y + (run.q.y - run.p.y) * t }
        const box = { x: at.x - width / 2, y: at.y - height / 2, width, height }
        if (taken.some((r) => touches(box, r))) continue
        found = at
        taken.push(box)
        break
      }
      if (found) break
    }
    if (found) out.set(b.id, found)
  }
  return out
}
