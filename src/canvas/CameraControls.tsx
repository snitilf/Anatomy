import { useReactFlow, useStore, useStoreApi, type Viewport } from '@xyflow/react'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { LABEL_GROWTH } from './buildGraph'
import { useAppStore } from '../app/store'
import { useUi, useUiApi } from '../app/ui'
import { hasRememberedView, writeHash } from '../app/view'
import { usePhone } from '../app/usePhone'
import type { Rect } from '../layout/geometry'
import { clampViewport, frameViewport, viewportFor, zoomAround, type Limits } from './camera'
import { GLIDE_MS, prefersStillness, useCamera } from './cameraContext'
import { FAR_ENTER, farLabelScale, nextFar } from './far'

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
  const { selection, board, playing } = useAppStore(useShallow((s) => ({ selection: s.selection, board: s.board, playing: s.scenario !== undefined })))
  const flow = useReactFlow()
  const camera = useCamera()
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const phone = usePhone()
  const stop = useUi((u) => u.sheet)
  const previous = useRef<string | undefined>(undefined)
  /** The selection that was picked on the map, which the sheet coming up does not move the view for. */
  const pickedKey = useRef<string | undefined>(undefined)
  const key = selection && selection.type !== 'board' ? `${selection.type}:${selection.id}` : undefined
  // On a phone the sheet covers the lower half of the map once a selection raises it, so the part has to sit in the upper half.
  const covered = phone && !playing && stop !== 2

  /** Moves the camera so the selection shows in the part of the map that is not under the sheet. */
  const reveal = useCallback(
    (picked: boolean) => {
      if (!selection || selection.type === 'board' || !board) return
      const size = camera.size()
      const area = covered ? { ...size, height: size.height / 2 } : size
      const narrow = width > 0 && width < 600
      if (selection.type === 'relationship') {
        const r = board.relationships.find((x) => x.id === selection.id)
        const ends = r ? box([rectOf(r.from), rectOf(r.to)].filter((x): x is Rect => x !== undefined)) : undefined
        if (!ends || !narrow) return
        if (!covered) {
          camera.frame({ box: ends, padding: 0.25, maxZoom: 0.9 })
          return
        }
        // Both ends fit in the part of the map above the sheet, at any zoom the limits allow.
        // Set directly: `move` would center a board that fits in the map on the whole map, under the sheet.
        void flow.setViewport(frameViewport(camera.limits(), area, { box: ends, padding: 0.25, maxZoom: 0.9 }), { duration: 0 })
        return
      }
      // A card picked on the map is under the pointer already, so the view stays put, even where the sheet covers it.
      if (selection.type === 'component' && picked) return
      const node = rectOf(selection.id)
      if (!node) return
      const next = viewportFor(flow.getViewport(), area, node, narrow)
      if (next) camera.move(next)
    },
    [selection, board, camera, flow, width, covered, rectOf],
  )

  useEffect(() => {
    if (previous.current === key) return
    previous.current = key
    const here = takePicked()
    const picked = selection?.type === 'component' && here === selection.id
    pickedKey.current = picked ? key : undefined
    reveal(picked)
    // `reveal` follows the size of the map, which does not start a reveal of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, selection, takePicked])

  // The sheet coming up to half over a part that is already selected.
  useEffect(() => {
    if (phone && stop === 1 && pickedKey.current !== key) reveal(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, stop, height])

  return null
}

/**
 * Frames the map in the room that notices leave free. The first frame shows the whole board when it is readable that
 * way, else the start of the flow at a readable zoom. A walkthrough step frames the parts it is about, and the whole
 * board when it names none. A resize of the map keeps the middle of the view, once nothing is held.
 */
export function Camera({ stepKey, focus, dragging, rectOf }: { stepKey: string | undefined; focus: readonly string[]; dragging: boolean; rectOf: (id: string) => Rect | undefined }) {
  const camera = useCamera()
  const flow = useReactFlow()
  const ui = useUiApi()
  const phone = usePhone()
  const boardId = useAppStore((s) => s.board?.id)
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
      // The parts of a step are always fully in frame. They show at the zoom that fits them, which is 0.8 or more when
      // they fit there, and names show. When they do not fit at 0.8, they are fitted anyway and may land in the far view,
      // where the spotlight accents the highlighted tiles. A step that names no parts is the whole board, and fitting
      // the whole board in the far view is deliberate: it is the overview.
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
    // On a phone, a board opened for the first time whose whole is in the far view opens on the Overview, which lists
    // everything grouped. A view the reader has chosen before wins, and the Map tab still shows the far view.
    if (phone && boardId !== undefined && stepKey === undefined && !hasRememberedView(boardId) && flow.getViewport().zoom < FAR_ENTER) {
      ui.setViewState('overview')
      writeHash('overview', false, boardId)
    }
    // Only the first frame decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, width, height, fit])

  useEffect(() => {
    if (shown.current === stepKey) return
    const before = shown.current
    shown.current = stepKey
    // A walkthrough that ends frames the whole board.
    if (before === undefined && stepKey === undefined) return
    fit(!byKeyboard.current)
  }, [stepKey, fit])

  // A new size of the map, such as the sidebar opening, closing, or changing width, keeps what is in the middle of the
  // view where it was. The zoom stays unless the new limits ask for another one.
  const keepMiddle = useCallback(() => {
    if (!map) return
    const now = map.getBoundingClientRect()
    const before = framed.current
    framed.current = now
    if (!before || sameSize(before, now)) return
    const view = flow.getViewport()
    camera.move({ x: view.x + (now.width - before.width) / 2, y: view.y + (now.height - before.height) / 2, zoom: view.zoom })
  }, [camera, flow, map])

  useEffect(() => {
    if (!started.current) return
    const timer = window.setTimeout(() => {
      // Moving the view under a held card would move it away from the pointer. It waits for the drop.
      if (busy.current) waiting.current = true
      else keepMiddle()
    }, RESIZE_MS)
    return () => window.clearTimeout(timer)
  }, [width, height, keepMiddle])

  useEffect(() => {
    busy.current = dragging
    if (dragging || !waiting.current) return
    waiting.current = false
    keepMiddle()
  }, [dragging, keepMiddle])

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
 * The wheel zooms around the pointer, and so does a pinch on a trackpad (which arrives as Ctrl and wheel). A mouse
 * wheel notch sends a large delta, and React Flow turns the largest ones into a jump of several times the size. This
 * takes those events first and keeps each one to a step of about 20 per cent, inside the zoom limits. Small deltas are
 * not changed. Panning is by dragging the empty map, with Space held, or with the Hand tool.
 */
export function WheelZoom() {
  const flow = useReactFlow()
  const camera = useCamera()
  const map = useStore((s) => s.domNode)
  useEffect(() => {
    if (!map) return
    const mac = /Mac/i.test(navigator.platform)
    const onWheel = (event: WheelEvent) => {
      if ((event.target as Element | null)?.closest('.nowheel')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const unit = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002
      // A pinch on a Mac sends small deltas, so it is amplified. A wheel notch is not.
      const octaves = -event.deltaY * unit * (mac && event.ctrlKey ? 10 : 1)
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
const TINY_ZOOM = 0.6

/**
 * Reports how labels show on the map: all of them when zoomed in, or on a quiet map only those of the selection
 * and of the card under the pointer. A crowded board is quiet below `LABELS_ZOOM`, and every board is quiet when the
 * text would be too small to read. Only a change across a threshold renders.
 */
/** Below this zoom, line and group labels are drawn larger on the board, so they stay about this size on screen. */
const LABEL_FLOOR_PX = 9
const LABEL_BASE_PX = 11
const LABEL_MAX_SCALE = LABEL_GROWTH

/**
 * Sets `--label-scale` on the map: how much line and group labels grow so they never render under 9px on screen.
 * It is 1 from about 0.82 zoom up, so zooming in the normal range writes nothing, and it never passes 1.3.
 */
export function LabelScale({ far }: { far: boolean }) {
  const map = useStore((s) => s.domNode)
  const store = useStoreApi()
  useLayoutEffect(() => {
    if (!map) return
    const apply = (zoom: number) => {
      // Steps of a tenth, rounded up so the floor holds. Placement of labels is worked out at 1x, so the growth stays small.
      // The far view draws labels as large as it takes to hold their base size on screen.
      if (far) {
        map.style.setProperty('--label-scale', farLabelScale(zoom).toFixed(2))
        return
      }
      const scale = Math.min(LABEL_MAX_SCALE, Math.max(1, Math.ceil((LABEL_FLOOR_PX / (LABEL_BASE_PX * zoom)) * 10 - 1e-6) / 10))
      map.style.setProperty('--label-scale', scale.toFixed(1))
    }
    apply(store.getState().transform[2])
    return store.subscribe((state, prev) => {
      if (state.transform[2] !== prev.transform[2]) apply(state.transform[2])
    })
  }, [map, store, far])
  return null
}

/**
 * Reports whether the map is in the far view. The two crossings differ (see `FAR_ENTER` and `FAR_EXIT`), so a zoom at
 * rest near the threshold does not flip it. Only a crossing renders.
 */
export function FarMode({ onChange }: { onChange: (far: boolean) => void }) {
  const store = useStoreApi()
  useLayoutEffect(() => {
    let far = false
    const apply = (zoom: number) => {
      const next = nextFar(far, zoom)
      if (next === far) return
      far = next
      onChange(far)
    }
    // A new start is never far: what the map showed before this effect ran is not known here.
    onChange(false)
    apply(store.getState().transform[2])
    return store.subscribe((state, prev) => {
      if (state.transform[2] !== prev.transform[2]) apply(state.transform[2])
    })
  }, [store, onChange])
  return null
}

export function LabelMode({ crowded, onChange }: { crowded: boolean; onChange: (quiet: boolean) => void }) {
  const near = useStore((s) => s.transform[2] >= LABELS_ZOOM)
  const tiny = useStore((s) => s.transform[2] < TINY_ZOOM)
  const quiet = !near && (crowded || tiny)
  useLayoutEffect(() => onChange(quiet), [quiet, onChange])
  return null
}
