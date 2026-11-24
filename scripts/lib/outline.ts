import type { PackedOutline } from '../../src/app/outline.ts'
import type { Board } from '../../src/board/schema.ts'
import { computeGeometry } from '../../src/canvas/buildGraph.ts'
import { placeCards } from '../../src/layout/cards.ts'
import type { Point, Rect } from '../../src/layout/geometry.ts'

const PAD = 32
const SCALE = 8

function snap(n: number): number {
  return Math.round(n / SCALE)
}

/** Shifts an orthogonal polyline into scaled outline coordinates, drops collinear interior points, and emits a compact SVG path. */
function shiftedPath(points: readonly Point[], dx: number, dy: number): string {
  if (points.length === 0) return ''
  const corners: { x: number; y: number }[] = []
  for (const p of points) {
    const x = snap(p.x - dx)
    const y = snap(p.y - dy)
    const prev = corners[corners.length - 1]
    if (prev && prev.x === x && prev.y === y) continue
    if (corners.length >= 2) {
      const a = corners[corners.length - 2]!
      const b = corners[corners.length - 1]!
      if ((a.x === b.x && b.x === x) || (a.y === b.y && b.y === y)) {
        corners[corners.length - 1] = { x, y }
        continue
      }
    }
    corners.push({ x, y })
  }
  return corners
    .map((p, i) => {
      if (i === 0) return `M${p.x} ${p.y}`
      const prev = corners[i - 1]!
      if (p.x === prev.x) return `V${p.y}`
      if (p.y === prev.y) return `H${p.x}`
      return `L${p.x} ${p.y}`
    })
    .join('')
}

/**
 * Computes a compact, deterministic packed map outline from a parsed board, using the same
 * card layout, group areas, and line routing that the map itself draws.
 */
export function buildOutline(board: Board): PackedOutline {
  const rects = placeCards(board, { positions: {}, sizes: {} })
  const boxes = Object.values(rects)
  // The same solve the map runs, so the previews cannot drift from it.
  const geometry = computeGeometry(board, rects)
  const rawGroups: Rect[] = geometry.groups.map(({ x, y, width, height }) => ({ x, y, width, height }))
  const routes = geometry.edges

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const includeRect = (r: Rect) => {
    if (r.x < minX) minX = r.x
    if (r.y < minY) minY = r.y
    if (r.x + r.width > maxX) maxX = r.x + r.width
    if (r.y + r.height > maxY) maxY = r.y + r.height
  }

  for (const r of boxes) includeRect(r)
  for (const g of rawGroups) includeRect(g)
  for (const route of routes.values()) {
    for (const p of route.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }

  if (!Number.isFinite(minX)) {
    return [40, 25, board.components.length, board.relationships.length, board.scenarios.length, [], 0, 0, [], '']
  }

  const ox = minX - PAD
  const oy = minY - PAD
  const width = Math.max(1, snap(maxX - minX + PAD * 2))
  const height = Math.max(1, snap(maxY - minY + PAD * 2))

  const toRects = (list: readonly Rect[]) =>
    list.map((r) => {
      const x = Math.max(0, snap(r.x - ox))
      const y = Math.max(0, snap(r.y - oy))
      const w = Math.min(width - x, Math.max(1, snap(r.width)))
      const h = Math.min(height - y, Math.max(1, snap(r.height)))
      return { x, y, w, h }
    })

  const groups = toRects(rawGroups).flatMap((r) => [r.x, r.y, r.w, r.h])
  const cardRects = toRects(board.components.map((c) => rects[c.id]).filter((r): r is Rect => r !== undefined))
  const first = cardRects[0]
  const uniform = first !== undefined && cardRects.every((r) => r.w === first.w && r.h === first.h)
  const cardW = uniform ? first.w : 0
  const cardH = uniform ? first.h : 0
  const cards = uniform ? cardRects.flatMap((r) => [r.x, r.y]) : cardRects.flatMap((r) => [r.x, r.y, r.w, r.h])
  const lines = board.relationships
    .map((r) => routes.get(r.id))
    .filter((route): route is NonNullable<typeof route> => route !== undefined)
    .map((route) => shiftedPath(route.points, ox, oy))
    .filter((d) => d.length > 0)
    .join(';')

  return [width, height, board.components.length, board.relationships.length, board.scenarios.length, groups, cardW, cardH, cards, lines]
}
