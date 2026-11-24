import type { BoardOutline, OutlineRect } from '../../src/app/outline.ts'
import type { Board } from '../../src/board/schema.ts'
import { Drawn, Obstacles, planEdges, routeConnection, type EdgeEnds, type Route } from '../../src/canvas/routing.ts'
import { groupAreas, placeCards } from '../../src/layout/cards.ts'
import type { Point, Rect } from '../../src/layout/geometry.ts'

const PAD = 32

function round(n: number): number {
  return Math.round(n)
}

/** Shifts an orthogonal polyline into outline coordinates, drops collinear interior points, and emits a compact SVG path. */
function shiftedPath(points: readonly Point[], dx: number, dy: number): string {
  if (points.length === 0) return ''
  const corners: { x: number; y: number }[] = []
  for (const p of points) {
    const x = round(p.x - dx)
    const y = round(p.y - dy)
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
  return corners.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join('')
}

/**
 * Computes a compact, deterministic map outline from a parsed board using the
 * real card layout, group areas, and orthogonal edge router.
 */
export function buildOutline(board: Board): BoardOutline {
  const rects = placeCards(board, { positions: {}, sizes: {} })
  const boxes = Object.values(rects)
  const groupMap = groupAreas(board, rects)
  const rawGroups = board.groups.map((g) => groupMap[g.id]).filter((r): r is Rect => r !== undefined)
  const groupRect = new Map<string, Rect>(Object.entries(groupMap))
  const groupOfCard = new Map<string, string | undefined>(board.components.map((c) => [c.id, c.group]))

  const ownGroups = (end: EdgeEnds): Rect[] => {
    const out: Rect[] = []
    for (const card of [end.from, end.to]) {
      const g = groupOfCard.get(card)
      const r = g === undefined ? undefined : groupRect.get(g)
      if (r) out.push(r)
    }
    return out
  }

  const obstacles = new Obstacles(boxes, rawGroups)
  const ends: EdgeEnds[] = board.relationships.map((r) => ({ id: r.id, from: r.from, to: r.to }))
  const plans = planEdges(rects, ends)

  const order = ends.map((_, i) => i)
  const reach = (i: number) => {
    const plan = plans.get(ends[i]!.id)
    return plan ? Math.abs(plan.a.x - plan.b.x) + Math.abs(plan.a.y - plan.b.y) : Infinity
  }
  order.sort((i, j) => reach(i) - reach(j) || (ends[i]!.id < ends[j]!.id ? -1 : 1))

  const drawn = new Drawn()
  const routes = new Map<string, Route>()
  for (const i of order) {
    const end = ends[i]!
    const plan = plans.get(end.id)
    if (!plan || !rects[end.from] || !rects[end.to]) continue
    const route = routeConnection(plan, boxes, drawn, obstacles, ownGroups(end))
    if (route.runs) drawn.add(route.runs)
    routes.set(end.id, route)
  }

  // Compute bounding box across cards, groups, and routed line points.
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
    return {
      width: 320,
      height: 200,
      groups: [],
      cards: [],
      lines: [],
      parts: board.components.length,
      connections: board.relationships.length,
      walkthroughs: board.scenarios.length,
    }
  }

  const ox = minX - PAD
  const oy = minY - PAD
  const width = Math.max(1, round(maxX - minX + PAD * 2))
  const height = Math.max(1, round(maxY - minY + PAD * 2))

  const toOutlineRect = (r: Rect): OutlineRect => ({
    x: round(r.x - ox),
    y: round(r.y - oy),
    w: round(r.width),
    h: round(r.height),
  })

  const groups: OutlineRect[] = rawGroups.map(toOutlineRect)
  const cards: OutlineRect[] = board.components
    .map((c) => rects[c.id])
    .filter((r): r is Rect => r !== undefined)
    .map(toOutlineRect)
  const lines: string[] = board.relationships
    .map((r) => routes.get(r.id))
    .filter((route): route is Route => route !== undefined)
    .map((route) => shiftedPath(route.points, ox, oy))
    .filter((d) => d.length > 0)

  return {
    width,
    height,
    groups,
    cards,
    lines,
    parts: board.components.length,
    connections: board.relationships.length,
    walkthroughs: board.scenarios.length,
  }
}
