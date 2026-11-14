import { getStroke } from 'perfect-freehand'
import type { Point } from '../layout/geometry'

/** Width of a pen line, in board pixels. */
export const PEN_SIZE = 3

/**
 * Even width for every pointer. Stored points carry no pressure, so a pressure line would change shape when it is saved.
 * `last` is true once the line is finished, which closes its end cap.
 */
const options = (last: boolean) => ({ size: PEN_SIZE, thinning: 0, smoothing: 0.5, streamline: 0.4, simulatePressure: false, last })

const average = (a: number, b: number) => (a + b) / 2

/** The outline polygon as an SVG path, drawn with `fill`. From the perfect-freehand README. */
function pathOf(outline: readonly number[][]): string {
  const len = outline.length
  if (len < 4) return ''
  const p = (i: number) => outline[i] as [number, number]
  let a = p(0)
  let b = p(1)
  const c = p(2)
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(b[1], c[1]).toFixed(2)} T`
  for (let i = 2; i < len - 1; i++) {
    a = p(i)
    b = p(i + 1)
    d += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(2)} `
  }
  return `${d}Z`
}

/** A dot for a click with no movement. */
function dot(p: Point): string {
  const r = PEN_SIZE / 2
  return `M${p.x - r},${p.y}a${r},${r} 0 1,0 ${PEN_SIZE},0a${r},${r} 0 1,0 ${-PEN_SIZE},0Z`
}

/** The filled outline of a pen line through `points`. */
export function strokePath(points: readonly Point[], last = true): string {
  if (points.length === 0) return ''
  const path = pathOf(getStroke(points as Point[], options(last)))
  return path === '' ? dot(points[0] as Point) : path
}

/** The center line of a pen line, for the wide invisible line that takes the pointer. */
export function centerLine(points: readonly Point[]): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points as [Point, ...Point[]]
  if (rest.length === 0) return `M${first.x},${first.y}l0.01,0`
  return `M${first.x},${first.y}${rest.map((p) => `L${p.x},${p.y}`).join('')}`
}

const cache = new WeakMap<object, string>()

/** The outline of a saved line, worked out once per mark object. */
export function cachedStrokePath(mark: { points: readonly Point[] }): string {
  let path = cache.get(mark)
  if (path === undefined) {
    path = strokePath(mark.points)
    cache.set(mark, path)
  }
  return path
}
