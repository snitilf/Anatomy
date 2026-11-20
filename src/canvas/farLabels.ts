import type { Point, Rect } from '../layout/geometry'
import type { Bundle } from './bundleRoutes'
import { textWidth } from './textMeasure'

/** Natural sizes, before the scale: a group name is 13px medium on a 20px line, a count chip 11px on 18px, a tile name 11px on 16px. */
const NAME_LINE = 20
const NAME_LIFT = 5
const NAME_MAX = 260
const CHIP_HEIGHT = 18

const touches = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** The room the name and count of a group take above its top edge, at this label scale. */
export function groupNameRect(area: Rect, label: string, count: number, scale: number): Rect {
  const natural = Math.min(NAME_MAX, (textWidth(label, 'title') * 13) / 12 + 6 + String(count).length * 8 + 4)
  return { x: area.x, y: area.y - (NAME_LIFT + NAME_LINE) * scale, width: natural * scale, height: NAME_LINE * scale }
}

/** The room the user's mark takes in a count: one dash and dot, and the gap to the number. */
export const YOURS_TICK = 16

/** Whether a bundle mixes the user's links with the agent's lines, so its count carries the user's mark. */
export const isMixed = (b: Pick<Bundle, 'mine' | 'yours'>) => b.yours > 0 && !b.mine

/** The width of a count on the board at scale 1: its digits, its padding, and the user's mark on a mixed bundle. */
export const countWidth = (b: Pick<Bundle, 'count' | 'mine' | 'yours'>) => String(b.count).length * 7 + 12 + (isMixed(b) ? YOURS_TICK : 0)

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
    const height = CHIP_HEIGHT * scale
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
