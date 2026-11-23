import type { Board } from '../board/schema'
import type { Rect } from '../layout/geometry'
import type { Link, Reconnect } from '../layer/model'
import { computeGeometry, type Geometry } from './buildGraph'

/** The last solve. React may render the same change twice, and the second render must not solve again. */
let lastSolve: { board: Board; links: readonly Link[] | undefined; reconnects: readonly Reconnect[] | undefined; previous: Geometry | undefined; rects: Record<string, Rect>; geometry: Geometry } | undefined

export function solve(board: Board, rects: Record<string, Rect>, links: readonly Link[] | undefined, previous: Geometry | undefined, reconnects: readonly Reconnect[] | undefined): Geometry {
  // Only a solve that builds on a previous one is repeated by React. A solve from scratch, such as the one after the fonts
  // load, is never taken from the last one, because the text sizes may have changed since.
  const last = previous ? lastSolve : undefined
  if (last && last.board === board && last.links === links && last.reconnects === reconnects && last.previous === previous && sameRects(last.rects, rects)) return last.geometry
  const geometry = computeGeometry(board, rects, links ?? [], previous, reconnects ?? [])
  lastSolve = { board, links, reconnects, previous, rects, geometry }
  return geometry
}

export function sameRects(a: Record<string, Rect>, b: Record<string, Rect>): boolean {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => {
      const p = a[k]
      const q = b[k]
      return p !== undefined && q !== undefined && p.x === q.x && p.y === q.y && p.width === q.width && p.height === q.height
    })
  )
}
