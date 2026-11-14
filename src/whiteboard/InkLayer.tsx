import { useReactFlow, ViewportPortal } from '@xyflow/react'
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { inflate, type Point } from '../layout/geometry'
import type { Mark } from '../layer/model'
import { arrowEnds, markBounds, translateMark, type Scene } from './geometry'
import { cachedStrokePath, centerLine } from './stroke'
import styles from './whiteboard.module.css'

type Ink = Exclude<Mark, { kind: 'text' | 'sticky' }>
type Arrow = Extract<Mark, { kind: 'arrow' }>

const WORD: Record<Ink['kind'], string> = { stroke: 'Drawing', rect: 'Rectangle', ellipse: 'Ellipse', arrow: 'Arrow' }

/** How far the pointer must travel before a press on a mark becomes a move. */
const MOVE_SLOP = 3

const isInk = (m: Mark): m is Ink => m.kind !== 'text' && m.kind !== 'sticky'

interface Moving {
  id: string
  dx: number
  dy: number
}

interface Handlers {
  interactive: boolean
  onPress(event: PointerEvent<SVGGElement>, mark: Ink): void
  onKey(event: KeyboardEvent<SVGGElement>, mark: Ink): void
}

/** The visible ink and the wide invisible line that takes the pointer. Both follow the same outline. */
function shapeOf(mark: Exclude<Ink, Arrow>): { ink: ReactNode; hit: ReactNode } {
  if (mark.kind === 'stroke') {
    return { ink: <path className={styles.pen} d={cachedStrokePath(mark)} />, hit: <path className={styles.hit} d={centerLine(mark.points)} /> }
  }
  const { x, y, width, height } = mark
  if (mark.kind === 'rect') {
    return { ink: <rect className={styles.shape} x={x} y={y} width={width} height={height} rx={6} />, hit: <rect className={styles.hit} x={x} y={y} width={width} height={height} rx={6} /> }
  }
  const e = { cx: x + width / 2, cy: y + height / 2, rx: width / 2, ry: height / 2 }
  return { ink: <ellipse className={styles.shape} {...e} />, hit: <ellipse className={styles.hit} {...e} /> }
}

const InkMark = memo(function InkMark({ mark, selected, offset, handlers }: { mark: Exclude<Ink, Arrow>; selected: boolean; offset: Point | undefined; handlers: Handlers }) {
  const { ink, hit } = shapeOf(mark)
  return (
    <g
      className={styles.mark}
      data-mark={mark.id}
      data-selected={selected || undefined}
      transform={offset ? `translate(${offset.x} ${offset.y})` : undefined}
      tabIndex={handlers.interactive ? 0 : -1}
      role="button"
      aria-label={WORD[mark.kind]}
      aria-pressed={selected}
      onPointerDown={(e) => handlers.onPress(e, mark)}
      onKeyDown={(e) => handlers.onKey(e, mark)}
    >
      {ink}
      {hit}
    </g>
  )
})

const ArrowMark = memo(function ArrowMark({ mark, scene, selected, handlers }: { mark: Arrow; scene: Scene; selected: boolean; handlers: Handlers }) {
  const ends = arrowEnds(mark, scene)
  if (!ends) return null
  const d = `M${ends.a.x},${ends.a.y}L${ends.b.x},${ends.b.y}`
  return (
    <g
      className={styles.mark}
      data-mark={mark.id}
      data-selected={selected || undefined}
      tabIndex={handlers.interactive ? 0 : -1}
      role="button"
      aria-label={WORD.arrow}
      aria-pressed={selected}
      onPointerDown={(e) => handlers.onPress(e, mark)}
      onKeyDown={(e) => handlers.onKey(e, mark)}
    >
      <path className={styles.arrow} d={d} markerEnd={selected ? 'url(#ink-head-selected)' : 'url(#ink-head)'} />
      <path className={styles.hit} d={d} />
    </g>
  )
})

/** The saved strokes and shapes. They change only when the marks do, so a card drag never draws them again. */
const Shapes = memo(function Shapes({ marks, selected, moving, handlers }: { marks: readonly Ink[]; selected: string | undefined; moving: Moving | undefined; handlers: Handlers }) {
  return (
    <>
      {marks.map((m) =>
        m.kind === 'arrow' ? null : (
          <InkMark key={m.id} mark={m} selected={m.id === selected} offset={moving?.id === m.id ? { x: moving.dx, y: moving.dy } : undefined} handlers={handlers} />
        ),
      )}
    </>
  )
})

/** Arrows follow the parts and connections they are attached to, so they draw again when those move. */
function Arrows({ marks, scene, selected, moving, handlers }: { marks: readonly Ink[]; scene: Scene; selected: string | undefined; moving: Moving | undefined; handlers: Handlers }) {
  return (
    <>
      {marks.map((m) => (m.kind === 'arrow' ? <ArrowMark key={m.id} mark={moving?.id === m.id ? (translateMark(m, moving.dx, moving.dy) as Arrow) : m} scene={scene} selected={m.id === selected} handlers={handlers} /> : null))}
    </>
  )
}

export interface InkLayerProps {
  marks: readonly Mark[]
  scene: Scene
  selected: string | undefined
  /** The marks take the pointer only under the Select tool. */
  interactive: boolean
  onSelect(id: string): void
  onMoved(id: string, mark: Mark): void
  /** Drawn on top of the marks, in board coordinates: the end handles of the selection. */
  children?: ReactNode
}

/**
 * Strokes, rectangles, ellipses, and arrows, in one SVG in board coordinates above the cards.
 * Only the lines take the pointer, through a wide invisible copy of each, so the cards under a shape stay reachable.
 */
export function InkLayer({ marks, scene, selected, interactive, onSelect, onMoved, children }: InkLayerProps) {
  const flow = useReactFlow()
  const [moving, setMoving] = useState<Moving | undefined>(undefined)
  const inkMarks = useMemo(() => marks.filter(isInk), [marks])
  const latest = useRef({ onSelect, onMoved, interactive, inkMarks })
  useLayoutEffect(() => {
    latest.current = { onSelect, onMoved, interactive, inkMarks }
  })

  const onPress = useCallback(
    (event: PointerEvent<SVGGElement>, mark: Ink) => {
      if (!latest.current.interactive || event.button !== 0) return
      event.stopPropagation()
      latest.current.onSelect(mark.id)
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)
      const start = { x: event.clientX, y: event.clientY }
      const zoom = flow.getViewport().zoom
      let shift: Moving | undefined
      const move = (e: globalThis.PointerEvent) => {
        const dx = (e.clientX - start.x) / zoom
        const dy = (e.clientY - start.y) / zoom
        if (!shift && Math.hypot(e.clientX - start.x, e.clientY - start.y) < MOVE_SLOP) return
        shift = { id: mark.id, dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10 }
        setMoving(shift)
      }
      const done = (e: globalThis.PointerEvent) => {
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', done)
        target.removeEventListener('pointercancel', done)
        target.releasePointerCapture?.(e.pointerId)
        setMoving(undefined)
        if (e.type === 'pointerup' && shift) {
          const current = latest.current.inkMarks.find((m) => m.id === mark.id)
          if (current) latest.current.onMoved(mark.id, translateMark(current, shift.dx, shift.dy))
        }
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', done)
      target.addEventListener('pointercancel', done)
    },
    [flow],
  )
  const onKey = useCallback((event: KeyboardEvent<SVGGElement>, mark: Ink) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    latest.current.onSelect(mark.id)
  }, [])
  // Changes only with the tool, so the memoized marks draw again only then.
  const handlers = useMemo<Handlers>(() => ({ interactive, onPress, onKey }), [interactive, onPress, onKey])

  const chosen = selected ? inkMarks.find((m) => m.id === selected) : undefined
  const box = chosen && chosen.kind !== 'arrow' ? markBounds(moving?.id === chosen.id ? translateMark(chosen, moving.dx, moving.dy) : chosen, scene) : undefined

  return (
    <ViewportPortal>
      <svg className={styles.ink} data-interactive={interactive || undefined} aria-label="Drawings" role="group">
        <defs>
          <marker id="ink-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M1,1 L9,5 L1,9" className={styles.head} />
          </marker>
          <marker id="ink-head-selected" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M1,1 L9,5 L1,9" className={styles.headSelected} />
          </marker>
        </defs>
        <Shapes marks={inkMarks} selected={selected} moving={moving} handlers={handlers} />
        <Arrows marks={inkMarks} scene={scene} selected={selected} moving={moving} handlers={handlers} />
        {box && <rect className={styles.selection} {...inflate(box, 6)} rx={4} />}
        {children}
      </svg>
    </ViewportPortal>
  )
}
