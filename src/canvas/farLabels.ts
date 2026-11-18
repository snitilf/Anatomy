import type { Point, Rect } from '../layout/geometry'
import { NAMED_TILE_PX } from './far'
import type { Bundle } from './bundleRoutes'
import { textWidth } from './textMeasure'

/** Natural sizes, before the scale: a group name is 13px medium on a 20px line, a count chip 11px on 18px, a tile name 11px on 16px. */
const NAME_LINE = 20
const NAME_LIFT = 5
const NAME_MAX = 260
const CHIP_HEIGHT = 18
const TILE_LINE = 16
const TILE_GAP = 3

const touches = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** The room the name and count of a group take above its top edge, at this label scale. */
export function groupNameRect(area: Rect, label: string, count: number, scale: number): Rect {
  const natural = Math.min(NAME_MAX, (textWidth(label, 'title') * 13) / 12 + 6 + String(count).length * 8 + 4)
  return { x: area.x, y: area.y - (NAME_LIFT + NAME_LINE) * scale, width: natural * scale, height: NAME_LINE * scale }
}

export interface NamedTile {
  id: string
  label: string
  rect: Rect
}

export interface PlacedName {
  id: string
  /** The middle of the top edge of the name. */
  at: Point
  /** The most the name may take, in natural pixels. */
  max: number
  box: Rect
}

/**
 * Names for the parts that have no group, in the far view, where a tile has no text. A tile that is at least
 * `NAMED_TILE_PX` wide on screen is named under it, or over it when under is taken. A name with no free room is left out,
 * and the pointer shows it. `avoid` holds what a name keeps off: every other tile, the groups, and the group names.
 */
export function placeNames(tiles: readonly NamedTile[], avoid: readonly Rect[], scale: number): PlacedName[] {
  const taken: Rect[] = []
  const out: PlacedName[] = []
  for (const tile of [...tiles].sort((p, q) => (p.id < q.id ? -1 : 1))) {
    if (tile.rect.width / scale < NAMED_TILE_PX) continue
    const max = tile.rect.width / scale
    const width = Math.min(max, textWidth(tile.label, 'label') + 8) * scale
    const height = TILE_LINE * scale
    const x = tile.rect.x + tile.rect.width / 2 - width / 2
    const options = [tile.rect.y + tile.rect.height + TILE_GAP * scale, tile.rect.y - TILE_GAP * scale - height]
    for (const y of options) {
      const box = { x, y, width, height }
      const free = !avoid.some((r) => r !== tile.rect && touches(box, r)) && !taken.some((r) => touches(box, r))
      if (!free) continue
      taken.push(box)
      out.push({ id: tile.id, at: { x: tile.rect.x + tile.rect.width / 2, y: y === options[0] ? y : y + height }, max, box })
      break
    }
  }
  return out
}

/**
 * Where the count of each bundle sits: on a straight run of its line, nearest the middle of the longest run, sliding
 * along it when a name or another count is in the way. A count with no free place is left out.
 */
export function placeCounts(bundles: readonly Bundle[], avoid: readonly Rect[], scale: number): Map<string, Point> {
  const taken: Rect[] = [...avoid]
  const out = new Map<string, Point>()
  for (const b of bundles) {
    if (b.count < 2) continue
    const width = (String(b.count).length * 7 + 12) * scale
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
