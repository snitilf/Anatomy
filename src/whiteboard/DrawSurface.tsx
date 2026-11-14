import { useReactFlow, ViewportPortal } from '@xyflow/react'
import { useEffect, useRef, type PointerEvent, type WheelEvent } from 'react'
import type { Point } from '../layout/geometry'
import { simplifyStroke } from '../layer/edits'
import type { Mark, MarkEnd } from '../layer/model'
import { useCamera } from '../canvas/cameraContext'
import { partUnder } from './pointer'
import { arrowEnds, attachAt, dragBox, type Scene } from './geometry'
import { strokePath } from './stroke'
import type { Tool } from './tools'
import styles from './whiteboard.module.css'

/** How close, in screen pixels, an arrow end must come to a connection to attach to it. */
export const ATTACH_PX = 10
/** A press that moves less than this, in screen pixels, is a click. */
const CLICK_PX = 4
/** The size of a shape made by a click with no drag. */
const CLICK_SHAPE = { width: 160, height: 96 } as const

type DrawnKind = 'stroke' | 'rect' | 'ellipse' | 'arrow'
/** A mark as drawn, before it has an ID and a date. */
export type DrawnMark = { [K in DrawnKind]: Omit<Extract<Mark, { kind: K }>, 'id' | 'createdAt'> }[DrawnKind]

export interface Drawn {
  /** A finished pen line, rectangle, ellipse, or arrow, without its ID and date. */
  mark?: DrawnMark
  /** A click with the text, sticky, or part tool: where to start typing. */
  place?: Point
}

interface Gesture {
  pointer: number
  start: Point
  startScreen: Point
  last: Point
  shift: boolean
  points: Point[]
  from?: MarkEnd
  frame: number
}

/**
 * Takes the pointer while a drawing tool is in use. The line or shape in progress is kept in a ref and drawn once per
 * frame by setting attributes, never through React state. Letting go hands the result to `onDrawn` once.
 * Two-finger scrolling pans and pinching zooms, as on the map itself.
 */
export function DrawSurface({ tool, scene, onDrawn }: { tool: Tool; scene: () => Scene; onDrawn: (drawn: Drawn) => void }) {
  const flow = useReactFlow()
  const camera = useCamera()
  const gesture = useRef<Gesture | undefined>(undefined)
  const pen = useRef<SVGPathElement>(null)
  const shape = useRef<SVGPathElement>(null)

  useEffect(
    () => () => {
      if (gesture.current) cancelAnimationFrame(gesture.current.frame)
    },
    [],
  )

  const toBoard = (e: { clientX: number; clientY: number }) => flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
  const reach = () => ATTACH_PX / flow.getViewport().zoom

  const draw = () => {
    const g = gesture.current
    if (!g) return
    g.frame = 0
    if (tool === 'pen') {
      pen.current?.setAttribute('d', strokePath(g.points, false))
      return
    }
    const el = shape.current
    if (!el) return
    if (tool === 'rect' || tool === 'ellipse') {
      const b = dragBox(g.start, g.last, g.shift)
      el.setAttribute(
        'd',
        tool === 'rect'
          ? `M${b.x},${b.y}h${b.width}v${b.height}h${-b.width}Z`
          : `M${b.x},${b.y + b.height / 2}a${b.width / 2},${b.height / 2} 0 1,0 ${b.width},0a${b.width / 2},${b.height / 2} 0 1,0 ${-b.width},0Z`,
      )
    } else if (tool === 'arrow' && g.from) {
      const ends = arrowEnds({ id: 'mark-preview', createdAt: '', kind: 'arrow', from: g.from, to: { type: 'point', x: g.last.x, y: g.last.y } }, scene())
      if (ends) el.setAttribute('d', `M${ends.a.x},${ends.a.y}L${ends.b.x},${ends.b.y}`)
    }
  }
  const schedule = () => {
    const g = gesture.current
    if (g && g.frame === 0) g.frame = requestAnimationFrame(draw)
  }
  const clear = () => {
    pen.current?.setAttribute('d', '')
    shape.current?.setAttribute('d', '')
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || gesture.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = toBoard(event)
    const g: Gesture = { pointer: event.pointerId, start, startScreen: { x: event.clientX, y: event.clientY }, last: start, shift: event.shiftKey, points: [start], frame: 0 }
    if (tool === 'arrow') g.from = attachAt(start, scene(), reach(), partUnder(event.clientX, event.clientY))
    gesture.current = g
    schedule()
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || event.pointerId !== g.pointer) return
    // A pen or a fast mouse sends several points per frame. All of them make the line.
    const events = tool === 'pen' && typeof event.nativeEvent.getCoalescedEvents === 'function' ? event.nativeEvent.getCoalescedEvents() : [event.nativeEvent]
    for (const e of events.length > 0 ? events : [event.nativeEvent]) {
      const p = toBoard(e)
      if (tool === 'pen') g.points.push(p)
      g.last = p
    }
    g.shift = event.shiftKey
    schedule()
  }

  const finish = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const g = gesture.current
    if (!g || event.pointerId !== g.pointer) return
    gesture.current = undefined
    if (g.frame) cancelAnimationFrame(g.frame)
    clear()
    if (!commit) return
    const end = toBoard(event)
    const zoom = flow.getViewport().zoom
    const click = Math.hypot(event.clientX - g.startScreen.x, event.clientY - g.startScreen.y) < CLICK_PX
    if (tool === 'pen') {
      onDrawn({ mark: { kind: 'stroke', points: simplifyStroke([...g.points, end], 0.75 / zoom) } })
    } else if (tool === 'rect' || tool === 'ellipse') {
      const box = click
        ? { x: Math.round(end.x - CLICK_SHAPE.width / 2), y: Math.round(end.y - CLICK_SHAPE.height / 2), ...CLICK_SHAPE }
        : dragBox(g.start, end, event.shiftKey)
      onDrawn({ mark: { kind: tool, ...box } })
    } else if (tool === 'arrow') {
      if (click || !g.from) return
      const to = attachAt(end, scene(), reach(), partUnder(event.clientX, event.clientY))
      if (g.from.type === 'part' && to.type === 'part' && g.from.id === to.id) return
      onDrawn({ mark: { kind: 'arrow', from: g.from, to } })
    } else if (click) {
      onDrawn({ place: end })
    }
  }

  // The surface covers the map, so scrolling reaches it instead of the map: it pans here. A pinch, or Ctrl and the
  // wheel, is taken by the map's own wheel zoom before it gets here.
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey) return
    const view = flow.getViewport()
    camera.move({ x: view.x - event.deltaX * 0.8, y: view.y - event.deltaY * 0.8, zoom: view.zoom })
  }

  return (
    <>
      <div
        className={`${styles.surface} nopan nodrag`}
        data-tool={tool}
        data-draw-surface=""
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, true)}
        onPointerCancel={(e) => finish(e, false)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <ViewportPortal>
        <svg className={styles.ink} aria-hidden="true">
          <path ref={pen} className={styles.previewPen} />
          <path ref={shape} className={styles.preview} markerEnd={tool === 'arrow' ? 'url(#ink-head)' : undefined} />
        </svg>
      </ViewportPortal>
    </>
  )
}
