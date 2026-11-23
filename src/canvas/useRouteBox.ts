import { useEffect, useState } from 'react'
import type { Rect } from '../layout/geometry'

type Compute = () => Rect | undefined

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
 * once: the first time, and while the far view shows (which draws the same lines). Otherwise the last box stays until
 * the browser is idle, and then it is replaced. `wanted` is false when the fit could not reach the far view anyway.
 * `compute` must change whenever its answer can, such as when the layout or the connections change.
 */
export function useRouteBox(compute: Compute, far: boolean, wanted: boolean, _scope?: unknown): { box: Rect | undefined; resolveNow: () => Rect | undefined } {
  const [kept, setKept] = useState<{ compute: Compute; box: Rect | undefined } | undefined>()
  const fresh = kept?.compute === compute
  const now = wanted && !fresh && (far || kept === undefined)
  const box = fresh ? kept.box : now ? compute() : kept?.box
  // Kept in the same render, so the box is not worked out again by the render that follows.
  if (now) setKept({ compute, box })
  useEffect(() => {
    if (!wanted || fresh || now) return
    return whenIdle(() => setKept({ compute, box: compute() }))
  }, [compute, wanted, fresh, now])
  return { box, resolveNow: () => box }
}
