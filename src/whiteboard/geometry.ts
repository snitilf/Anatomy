import { center, type Point, type Rect } from '../layout/geometry'
import type { Mark, MarkEnd } from '../layer/model'

/**
 * Where marks sit on the map, and what an arrow end is attached to. Pure functions over board coordinates.
 */

/** What arrow ends can attach to: the rectangle of every part, and the drawn line of every connection. */
export interface Scene {
  rects: Readonly<Record<string, Rect>>
  /** The points of each connection's drawn line, by connection ID. */
  lines: ReadonlyMap<string, readonly Point[]>
}

export interface OnLine {
  /** How far the point is from the line. */
  distance: number
  /** Where along the line it is, from 0 at its start to 1 at its end. */
  t: number
  point: Point
}

function lengthOf(points: readonly Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point
    const b = points[i] as Point
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}

/** The point of a line nearest to `p`, with its distance and its place along the line. */
export function nearestOnLine(points: readonly Point[], p: Point): OnLine | undefined {
  if (points.length === 0) return undefined
  if (points.length === 1) {
    const only = points[0] as Point
    return { distance: Math.hypot(p.x - only.x, p.y - only.y), t: 0, point: only }
  }
  const total = lengthOf(points)
  let best: OnLine | undefined
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point
    const b = points[i] as Point
    const dx = b.x - a.x
    const dy = b.y - a.y
    const span = Math.hypot(dx, dy)
    const s = span === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (span * span)))
    const point = { x: a.x + dx * s, y: a.y + dy * s }
    const distance = Math.hypot(p.x - point.x, p.y - point.y)
    if (!best || distance < best.distance) best = { distance, t: total === 0 ? 0 : (walked + span * s) / total, point }
    walked += span
  }
  return best
}

/** The point at `t` along a line, by length. */
export function pointAlong(points: readonly Point[], t: number): Point | undefined {
  if (points.length === 0) return undefined
  const total = lengthOf(points)
  let left = Math.max(0, Math.min(1, t)) * total
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point
    const b = points[i] as Point
    const span = Math.hypot(b.x - a.x, b.y - a.y)
    if (left <= span) {
      const s = span === 0 ? 0 : left / span
      return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }
    }
    left -= span
  }
  return points[points.length - 1]
}

/** Where a line from the middle of `rect` toward `toward` leaves it. The middle when `toward` is inside. */
export function rectExit(rect: Rect, toward: Point): Point {
  const c = center(rect)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  const sx = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx)
  const sy = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy)
  const s = Math.min(sx, sy)
  if (!Number.isFinite(s) || s >= 1) return c
  return { x: c.x + dx * s, y: c.y + dy * s }
}

/** Where an end is, before it is cut back to the edge of its part. Undefined when what it is attached to is gone. */
function rough(end: MarkEnd, scene: Scene): Point | undefined {
  if (end.type === 'point') return { x: end.x, y: end.y }
  if (end.type === 'part') {
    const rect = scene.rects[end.id]
    return rect ? center(rect) : undefined
  }
  const line = scene.lines.get(end.id)
  return line ? pointAlong(line, end.t ?? 0.5) : undefined
}

/**
 * The two drawn ends of an arrow. An end on a part stops at the part's edge, on the line toward the other end.
 * Undefined when either end is attached to something no longer on the map.
 */
export function arrowEnds(mark: Extract<Mark, { kind: 'arrow' }>, scene: Scene): { a: Point; b: Point } | undefined {
  const a = rough(mark.from, scene)
  const b = rough(mark.to, scene)
  if (!a || !b) return undefined
  const cut = (end: MarkEnd, at: Point, other: Point) => {
    if (end.type !== 'part') return at
    const rect = scene.rects[end.id]
    return rect ? rectExit(rect, other) : at
  }
  return { a: cut(mark.from, a, b), b: cut(mark.to, b, a) }
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

/**
 * What an arrow end dropped at `p` attaches to: the part under the pointer, else the nearest connection within `reach`,
 * else the free point itself.
 */
export function attachAt(p: Point, scene: Scene, reach: number, part?: string): MarkEnd {
  if (part !== undefined && scene.rects[part]) return { type: 'part', id: part }
  let best: { id: string; on: OnLine } | undefined
  for (const [id, line] of scene.lines) {
    const on = nearestOnLine(line, p)
    if (on && on.distance <= reach && (!best || on.distance < best.on.distance)) best = { id, on }
  }
  if (best) return { type: 'relationship', id: best.id, t: round(best.on.t, 4) }
  return { type: 'point', x: round(p.x, 1), y: round(p.y, 1) }
}

/** True when two ends are attached to the same thing at the same place. */
export function sameEnd(a: MarkEnd, b: MarkEnd): boolean {
  if (a.type === 'point' && b.type === 'point') return a.x === b.x && a.y === b.y
  if (a.type === 'part' && b.type === 'part') return a.id === b.id
  if (a.type === 'relationship' && b.type === 'relationship') return a.id === b.id && a.t === b.t
  return false
}

/** A mark moved by `dx` and `dy`. Arrow ends attached to a part or a connection stay where they are attached. */
export function translateMark(mark: Mark, dx: number, dy: number): Mark {
  if (dx === 0 && dy === 0) return mark
  const shift = (p: Point) => ({ x: round(p.x + dx, 1), y: round(p.y + dy, 1) })
  switch (mark.kind) {
    case 'stroke':
      return { ...mark, points: mark.points.map(shift) }
    case 'arrow': {
      const move = (end: MarkEnd): MarkEnd => (end.type === 'point' ? { type: 'point', ...shift(end) } : end)
      return { ...mark, from: move(mark.from), to: move(mark.to) }
    }
    default:
      return { ...mark, ...shift(mark) }
  }
}

/** The box around a mark as drawn. An arrow counts both of its drawn ends. */
export function markBounds(mark: Mark, scene: Scene): Rect | undefined {
  if (mark.kind === 'stroke') {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of mark.points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }
  if (mark.kind === 'arrow') {
    const ends = arrowEnds(mark, scene)
    if (!ends) return undefined
    const x = Math.min(ends.a.x, ends.b.x)
    const y = Math.min(ends.a.y, ends.b.y)
    return { x, y, width: Math.abs(ends.a.x - ends.b.x), height: Math.abs(ends.a.y - ends.b.y) }
  }
  return { x: mark.x, y: mark.y, width: mark.width, height: mark.height }
}

/**
 * The box a rectangle or ellipse tool draws from `start` to `end`. With `square`, the shorter side grows to match the
 * longer, toward the pointer.
 */
export function dragBox(start: Point, end: Point, square: boolean): Rect {
  let dx = end.x - start.x
  let dy = end.y - start.y
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * side
    dy = Math.sign(dy || 1) * side
  }
  return {
    x: round(Math.min(start.x, start.x + dx), 1),
    y: round(Math.min(start.y, start.y + dy), 1),
    width: round(Math.abs(dx), 1),
    height: round(Math.abs(dy), 1),
  }
}
