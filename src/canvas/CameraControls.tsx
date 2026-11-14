import { useReactFlow, useStore, type Viewport } from '@xyflow/react'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../app/store'
import type { Rect } from '../layout/geometry'
import { clampViewport, zoomAround, type Limits } from './camera'
import { GLIDE_MS, prefersStillness, useCamera } from './cameraContext'

const STEP_MS = 220
const RESIZE_MS = 150

const sameSize = (a: { width: number; height: number } | undefined, b: { width: number; height: number }) =>
  a !== undefined && Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height)

function box(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  return { x: minX, y: minY, width: Math.max(...rects.map((r) => r.x + r.width)) - minX, height: Math.max(...rects.map((r) => r.y + r.height)) - minY }
}

/**
 * Keeps the selected part in view. On a narrow screen the whole map is tiny, so it zooms in on the part.
 * A part picked on the map itself (a click, or the start of a drag) is under the pointer already, so the view stays put.
 */
export function KeepSelectionInView({ takePicked, rectOf }: { takePicked: () => string | undefined; rectOf: (id: string) => Rect | undefined }) {
  const { selection, board } = useAppStore(useShallow((s) => ({ selection: s.selection, board: s.board })))
  const flow = useReactFlow()
  const camera = useCamera()
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const previous = useRef<string | undefined>(undefined)
  const key = selection && selection.type !== 'board' ? `${selection.type}:${selection.id}` : undefined

  useEffect(() => {
    if (previous.current === key) return
    previous.current = key
    const here = takePicked()
    if (selection?.type === 'component' && here === selection.id) return
    if (!selection || selection.type === 'board' || !board) return
    const narrow = width > 0 && width < 600
    if (selection.type === 'relationship') {
      const r = board.relationships.find((x) => x.id === selection.id)
      const ends = r ? box([rectOf(r.from), rectOf(r.to)].filter((x): x is Rect => x !== undefined)) : undefined
      if (ends && narrow) camera.frame({ box: ends, padding: 0.25, maxZoom: 0.9 })
      return
    }
    const node = rectOf(selection.id)
    if (!node) return
    const { zoom, x, y } = flow.getViewport()
    const left = node.x * zoom + x
    const top = node.y * zoom + y
    const visible = left >= 0 && top >= 0 && left + node.width * zoom <= width && top + node.height * zoom <= height
    if (narrow || !visible) {
      const z = narrow ? Math.max(zoom, 0.8) : zoom
      camera.move({ x: width / 2 - (node.x + node.width / 2) * z, y: height / 2 - (node.y + node.height / 2) * z, zoom: z })
    }
  }, [key, selection, board, flow, camera, width, height, takePicked, rectOf])

  return null
}

/**
 * Frames the map in the room that notices leave free. The first frame shows the whole board when it is readable that
 * way, else the start of the flow at a readable zoom. A walkthrough step frames the parts it is about, and the whole
 * board when it names none. A resize of the map frames it again, once nothing is held.
 */
export function Camera({ stepKey, focus, dragging, rectOf }: { stepKey: string | undefined; focus: readonly string[]; dragging: boolean; rectOf: (id: string) => Rect | undefined }) {
  const camera = useCamera()
  const map = useStore((s) => s.domNode)
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const latest = useRef({ stepKey, focus })
  const shown = useRef<string | undefined>(undefined)
  const framed = useRef<{ width: number; height: number } | undefined>(undefined)
  const started = useRef(false)
  const busy = useRef(dragging)
  const waiting = useRef(false)

  useEffect(() => {
    latest.current = { stepKey, focus }
  })

  // A step chosen with the keyboard moves the camera at once: arrow keys repeat, and a glide would lag behind them.
  const byKeyboard = useRef(false)
  useEffect(() => {
    const key = () => {
      byKeyboard.current = true
    }
    const pointer = () => {
      byKeyboard.current = false
    }
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointerdown', pointer, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerdown', pointer, true)
    }
  }, [])

  const fit = useCallback(
    (animate: boolean) => {
      const { stepKey: key, focus: parts } = latest.current
      const duration = animate && !prefersStillness() ? STEP_MS : 0
      const focusBox = key !== undefined ? box(parts.map(rectOf).filter((r): r is Rect => r !== undefined)) : undefined
      if (focusBox) camera.frame({ box: focusBox, padding: 0.25, maxZoom: 1 }, duration)
      else camera.frame({ readable: true }, duration)
      framed.current = map ? map.getBoundingClientRect() : undefined
    },
    [camera, map, rectOf],
  )

  // The first frame waits for the map to have a size.
  useEffect(() => {
    if (started.current || !map || width === 0 || height === 0) return
    started.current = true
    fit(false)
  }, [map, width, height, fit])

  useEffect(() => {
    if (shown.current === stepKey) return
    const before = shown.current
    shown.current = stepKey
    // A walkthrough that ends frames the whole board.
    if (before === undefined && stepKey === undefined) return
    fit(!byKeyboard.current)
  }, [stepKey, fit])

  useEffect(() => {
    if (!started.current) return
    const timer = window.setTimeout(() => {
      // A step that framed the map has already used the new size.
      if (map && sameSize(framed.current, map.getBoundingClientRect())) return
      // Refitting under a held card would move it away from the pointer. It waits for the drop.
      if (busy.current) waiting.current = true
      else fit(false)
    }, RESIZE_MS)
    return () => window.clearTimeout(timer)
  }, [width, height, fit, map])

  useEffect(() => {
    busy.current = dragging
    if (dragging || !waiting.current) return
    waiting.current = false
    fit(false)
  }, [dragging, fit])

  return null
}

/**
 * When the limits change, after a drop or when the map changes size, a view that is now out of bounds glides back in.
 * React Flow keeps the user's own panning inside the limits, but it does not move a view that the limits moved past.
 */
export function KeepInLimits({ limits }: { limits: Limits }) {
  const flow = useReactFlow()
  const camera = useCamera()
  useEffect(() => {
    const now = flow.getViewport()
    const size = camera.size()
    if (size.width === 0 || size.height === 0) return
    const next = clampViewport(now, limits, size)
    const far = Math.abs(next.x - now.x) > 0.5 || Math.abs(next.y - now.y) > 0.5 || Math.abs(next.zoom - now.zoom) > 1e-4
    if (far) camera.move(next, prefersStillness() ? 0 : GLIDE_MS)
  }, [limits, flow, camera])
  return null
}

/** The most one wheel event may change the zoom: a share of 20 per cent either way. */
const WHEEL_STEP = 1.2

/**
 * Ctrl and wheel zooms, and so does a pinch on a trackpad. A mouse wheel notch sends a large delta, and React Flow
 * turns the largest ones into a jump of several times the size. This takes those events first and keeps each one to
 * a step of about 20 per cent, inside the zoom limits. Small pinch deltas are not changed.
 */
export function WheelZoom() {
  const flow = useReactFlow()
  const camera = useCamera()
  const map = useStore((s) => s.domNode)
  useEffect(() => {
    if (!map) return
    const mac = /Mac/i.test(navigator.platform)
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || (event.target as Element | null)?.closest('.nowheel')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const unit = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002
      const octaves = -event.deltaY * unit * (mac ? 10 : 1)
      const limit = Math.log2(WHEEL_STEP)
      const limits = camera.limits()
      const view: Viewport = flow.getViewport()
      const next = Math.min(limits.maxZoom, Math.max(limits.minZoom, view.zoom * 2 ** Math.max(-limit, Math.min(limit, octaves))))
      if (next === view.zoom) return
      // Zoomed all the way out, the whole board is in view.
      if (next <= limits.minZoom + 1e-6) {
        camera.frame()
        return
      }
      // The point under the pointer stays where it is.
      const rect = map.getBoundingClientRect()
      camera.move(zoomAround(view, next, { x: event.clientX - rect.left, y: event.clientY - rect.top }))
    }
    map.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => map.removeEventListener('wheel', onWheel, { capture: true })
  }, [map, flow, camera])
  return null
}

/** Zoom at and above which every connection label shows. */
export const LABELS_ZOOM = 0.9
/** Below this zoom label text is too small to read on any board. */
const TINY_ZOOM = 0.5

/**
 * Reports how labels show on the map: all of them when zoomed in, or on a quiet map only those of the selection
 * and of the card under the pointer. A crowded board is quiet below `LABELS_ZOOM`, and every board is quiet when the
 * text would be too small to read. Only a change across a threshold renders.
 */
export function LabelMode({ crowded, onChange }: { crowded: boolean; onChange: (quiet: boolean) => void }) {
  const near = useStore((s) => s.transform[2] >= LABELS_ZOOM)
  const tiny = useStore((s) => s.transform[2] < TINY_ZOOM)
  const quiet = !near && (crowded || tiny)
  useLayoutEffect(() => onChange(quiet), [quiet, onChange])
  return null
}
