import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Rect } from '../layout/geometry'

type Compute = () => Rect | undefined
type Kept = { scope: unknown; compute: Compute; box: Rect | undefined }

/** Runs `work` when the browser is idle, or soon after when it has no idle callback. Returns the way to cancel it. */
function whenIdle(work: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(work, { timeout: 250 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(work, 50)
  return () => window.clearTimeout(id)
}

/**
 * The box around the far-view lines, for the fit. Solving the lines of a large board takes tens of milliseconds, so it
 * stays off the frame that commits a new layout. The box is worked out in the same render only when it is needed at
 * once: when another board opens (`scope` changes, so a box is never carried from one board to another), and while the
 * far view shows (which draws the same lines). Otherwise the last box stays until the browser is idle, and then it is
 * replaced. `wanted` is false when the fit could not reach the far view anyway.
 *
 * `compute` must be memoized: it keeps the same reference across renders and changes only when its answer can, such as
 * when the layout or the connections change. A new function on every render would solve on every render.
 *
 * `resolveNow` is for moves of the camera that need the box to be right, such as Fit. It solves a stale box at once,
 * keeps it, and cancels the idle solve. It answers from the kept box when that is fresh.
 */
export function useRouteBox(compute: Compute, far: boolean, wanted: boolean, scope: unknown): { box: Rect | undefined; resolveNow: () => Rect | undefined } {
  const [kept, setKept] = useState<Kept | undefined>()
  const own = kept?.scope === scope ? kept : undefined
  const sameScope = own !== undefined
  const fresh = own !== undefined && own.compute === compute
  const now = wanted && !fresh && (far || !sameScope)
  const box = !wanted ? undefined : own !== undefined && fresh ? own.box : now ? compute() : own ? own.box : undefined
  // Kept in the same render, so the box is not worked out again by the render that follows.
  if (now) setKept({ scope, compute, box })
  const latest = useRef({ scope, compute, kept })
  // A layout effect, like the refs of Canvas, so a fit in the commit that opens a board never reads the last board.
  useLayoutEffect(() => {
    latest.current = { scope, compute, kept }
  })
  useEffect(() => {
    if (!wanted || fresh || now) return
    return whenIdle(() => setKept({ scope, compute, box: compute() }))
  }, [scope, compute, wanted, fresh, now])
  const resolveNow = useCallback(() => {
    const l = latest.current
    if (l.kept && l.kept.scope === l.scope && l.kept.compute === l.compute) return l.kept.box
    const next = l.compute()
    const entry = { scope: l.scope, compute: l.compute, box: next }
    latest.current = { ...l, kept: entry }
    setKept(entry)
    return next
  }, [])
  return { box, resolveNow }
}
