import type { Board } from '../board/schema'
import type { Point, Rect } from '../layout/geometry'
import { groupAreas } from '../layout/groupArea'
import { groupBand } from './bands'
import { LABEL_GROWTH, pillRect, placeLabel, RunIndex, wrap, type LabelContext } from './labelPlacement'
import { Drawn, Obstacles, planEdges, RIP_UP_PASSES, routeConnection, type EdgeEnds, type Route } from './routing'

type Segment = readonly [Point, Point]

/** True when two segments cross at a point inside both. Touching at an end, or running along each other, is not a crossing. */
export function segmentsCross([p, q]: Segment, [r, s]: Segment): boolean {
  const side = (a: Point, b: Point, c: Point) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  return side(r, s, p) * side(r, s, q) < 0 && side(p, q, r) * side(p, q, s) < 0
}

/** How many times the lines cross one another, given the straight runs of each line. */
export function countCrossings(lines: readonly (readonly Segment[])[]): number {
  let count = 0
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      for (const s of lines[i] as readonly Segment[]) for (const t of lines[j] as readonly Segment[]) if (segmentsCross(s, t)) count++
    }
  }
  return count
}

/** How the lines of a layout read: how often they cross, and the connections whose label finds no place inside the board. */
export interface LineCheck {
  crossings: number
  unplaced: string[]
}

/**
 * Draws the board's lines and labels with the cards at these places, the way the map does: the lines shortest first,
 * each around the cards, the group names, and the lines before it, with the second passes for crowded lines; then each
 * label in the order of the board. Used to choose between layouts and to make room where a label does not fit.
 * Connections in `skip` are left out.
 */
export function checkLines(board: Board, rects: Readonly<Record<string, Rect>>, skip: ReadonlySet<string> = new Set()): LineCheck {
  const boxes = Object.values(rects)
  const areas = groupAreas(board, rects)
  // The group areas with their names. A line's own groups are found among these same objects.
  const groupRect = new Map(board.groups.flatMap((g) => (areas[g.id] ? [[g.id, { ...(areas[g.id] as Rect), label: g.label }] as const] : [])))
  const groups = [...groupRect.values()]
  const groupOf = new Map(board.components.map((c) => [c.id, c.group]))
  const obstacles = new Obstacles(boxes, groups)
  const ends: EdgeEnds[] = board.relationships.filter((r) => r.from !== r.to && rects[r.from] && rects[r.to] && !skip.has(r.id))
  const plans = planEdges(rects, ends)
  const reach = (e: EdgeEnds) => {
    const plan = plans.get(e.id)
    return plan ? Math.abs(plan.a.x - plan.b.x) + Math.abs(plan.a.y - plan.b.y) : Infinity
  }
  const order = [...ends].sort((a, b) => reach(a) - reach(b) || (a.id < b.id ? -1 : 1))
  const ownGroups = (e: EdgeEnds) =>
    [e.from, e.to].flatMap((id) => {
      const g = groupOf.get(id)
      const area = g === undefined ? undefined : groupRect.get(g)
      return area ? [area] : []
    })
  const routeAll = (list: readonly EdgeEnds[]) => {
    const drawn = new Drawn()
    const routes = new Map<string, Route>()
    for (const e of list) {
      const plan = plans.get(e.id)
      if (!plan) continue
      const route = routeConnection(plan, boxes, drawn, obstacles, ownGroups(e))
      if (route.runs) drawn.add(route.runs)
      routes.set(e.id, route)
    }
    return routes
  }
  let routes = routeAll(order)
  // As the map does: lines that found no room are routed again first, while that helps.
  for (let pass = 0; pass < RIP_UP_PASSES; pass++) {
    const crowded = order.filter((e) => routes.get(e.id)?.crowded)
    if (crowded.length === 0) break
    const first = new Set(crowded)
    const again = routeAll([...crowded, ...order.filter((e) => !first.has(e))])
    if (order.filter((e) => again.get(e.id)?.crowded).length >= crowded.length) break
    routes = again
  }
  const lines = [...routes.values()].map((route) => route.runs ?? route.points.slice(1).map((p, i) => [route.points[i] as Point, p] as const))

  // The labels, in the order of the board, as the map places them on a first build.
  const drawnLines = ends.filter((e) => routes.has(e.id))
  const index = new RunIndex()
  drawnLines.forEach((e, i) => index.add(i, routes.get(e.id)?.runs ?? []))
  const taken: Rect[] = []
  const frame = boundsOf([...boxes, ...groups])
  const context: LabelContext = { cards: boxes, bands: groups.map(groupBand), taken, lines: index, own: -1, frame }
  const unplaced: string[] = []
  drawnLines.forEach((e, i) => {
    const r = board.relationships.find((x) => x.id === e.id)
    const text = r ? (r.kind === 'unknown' ? `?? ${r.label}` : r.label) : ''
    if (text.trim() === '' || !wrap(text)) return
    const spot = placeLabel(routes.get(e.id)?.runs ?? [], text, { ...context, own: i })
    if (spot.hidden) {
      unplaced.push(e.id)
      return
    }
    taken.push(pillRect(spot, LABEL_GROWTH))
  })
  return { crossings: countCrossings(lines), unplaced }
}

function boundsOf(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y }
}
