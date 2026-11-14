import { useReactFlow } from '@xyflow/react'
import { useCallback, useLayoutEffect, useRef, type PointerEvent, type RefObject } from 'react'
import type { Point } from '../layout/geometry'
import type { Drop, EndRef } from './endDrop'
import { partNodeUnder } from './pointer'

/** How far an end must travel before a press on its handle counts as a drag. */
const SLOP = 3

/**
 * Drags one end of a line to a new place. While the pointer is down, a straight ghost runs from the end that stays to the
 * pointer, and the part under the pointer is outlined; both are set on the DOM, never through React state.
 * `tip` may move the ghost's end, such as onto the connection an arrow end would attach to.
 * Escape cancels. Letting go calls `onDrop` once.
 */
export function useEndDrag({
  ghost,
  onDrop,
  tip,
}: {
  ghost: RefObject<SVGLineElement | null>
  onDrop: (ref: EndRef, drop: Drop) => void
  tip?: (ref: EndRef, at: Point, part: string | undefined) => Point
}) {
  const flow = useReactFlow()
  const latest = useRef({ onDrop, tip })
  useLayoutEffect(() => {
    latest.current = { onDrop, tip }
  })
  return useCallback(
    (event: PointerEvent<SVGElement>, ref: EndRef, fixed: Point) => {
      if (event.button !== 0) return
      event.stopPropagation()
      event.preventDefault()
      const handle = event.currentTarget
      handle.setPointerCapture(event.pointerId)
      const start = { x: event.clientX, y: event.clientY }
      let started = false
      let marked: HTMLElement | undefined
      let drop: Drop | undefined
      const line = ghost.current
      const mark = (node: HTMLElement | undefined) => {
        if (node === marked) return
        marked?.removeAttribute('data-drop-target')
        node?.setAttribute('data-drop-target', '')
        marked = node
      }
      const move = (e: globalThis.PointerEvent) => {
        if (!started && Math.hypot(e.clientX - start.x, e.clientY - start.y) < SLOP) return
        started = true
        const at = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const node = partNodeUnder(e.clientX, e.clientY)
        mark(node)
        drop = { at, part: node?.dataset.id }
        const end = latest.current.tip?.(ref, at, drop.part) ?? at
        if (line) {
          line.setAttribute('x1', String(fixed.x))
          line.setAttribute('y1', String(fixed.y))
          line.setAttribute('x2', String(end.x))
          line.setAttribute('y2', String(end.y))
          line.style.visibility = 'visible'
        }
      }
      const stop = (commit: boolean) => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        handle.removeEventListener('pointercancel', cancel)
        window.removeEventListener('keydown', key, true)
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
        mark(undefined)
        if (line) line.style.visibility = 'hidden'
        if (commit && started && drop) latest.current.onDrop(ref, drop)
      }
      const up = () => stop(true)
      const cancel = () => stop(false)
      const key = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        stop(false)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
      handle.addEventListener('pointercancel', cancel)
      window.addEventListener('keydown', key, true)
    },
    [flow, ghost],
  )
}

