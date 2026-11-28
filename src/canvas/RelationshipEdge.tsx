import clsx from 'clsx'
import { CircleHelp } from 'lucide-react'
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { BaseEdge, EdgeLabelRenderer, useStoreApi, type Edge, type EdgeProps } from '@xyflow/react'
import { useAppDispatch } from '../app/store'
import type { EdgeData, TabSide } from './buildGraph'
import { prefersStillness } from './cameraContext'
import { KIND_STYLE, SELECTED_WIDTH, LINE_INK } from './kinds'
import { LabelCutout } from './LabelCutout'
import { pillHeight } from './labelPlacement'
import styles from './RelationshipEdge.module.css'

/** How long a followed line takes to draw once, while the camera glides the same length of time. */
const DRAW_MS = 300
/** The draw runs the strong ease-in-out of on-screen movement. */
const DRAW_EASE = 'cubic-bezier(0.77, 0, 0.175, 1)'

/** Puts a revision tab against one side of its label, 2 units off it, at the label's scale. */
function tabTransform(side: TabSide, x: number, y: number, width: number, height: number): string {
  const at = `translate(${x}px, ${y}px)`
  const off = (d: number) => `calc(${d}px * var(--label-scale, 1))`
  if (side === 'above') return `translate(-50%, -100%) ${at} translateY(${off(-(height / 2 + 2))})`
  if (side === 'below') return `translate(-50%, 0) ${at} translateY(${off(height / 2 + 2)})`
  if (side === 'left') return `translate(-100%, -50%) ${at} translateX(${off(-(width / 2 + 2))})`
  return `translate(0, -50%) ${at} translateX(${off(width / 2 + 2)})`
}

export const RelationshipEdge = memo(function RelationshipEdge(props: EdgeProps<Edge<EdgeData>>) {
  const { id, data, selected, markerEnd, interactionWidth, source, target } = props
  const dispatch = useAppDispatch()
  const flow = useStoreApi()
  const [hover, setHover] = useState(false)
  const line = useRef<SVGGElement>(null)
  const highlighted = data?.highlighted === true

  // A connection the step follows draws once, from its source to its target, and then rests. The end state is an
  // attribute on the path: `done` once the draw has finished, `still` when reduced motion skipped it. No frame is sampled.
  useEffect(() => {
    const path = line.current?.querySelector<SVGPathElement>(':scope > .react-flow__edge-path') ?? null
    if (!path) return
    delete path.dataset.drawn
    if (!highlighted) return
    if (prefersStillness()) {
      path.dataset.drawn = 'still'
      return
    }
    // The stroke is drawn at the size it is on screen (`vector-effect: non-scaling-stroke`), so the dash that hides
    // the line is the path's length on screen, not its length on the board.
    const screen = path.getTotalLength() * flow.getState().transform[2]
    if (!(screen > 0)) {
      path.dataset.drawn = 'done'
      return
    }
    const ink = path.style.strokeDasharray
    path.style.strokeDasharray = `${screen} ${screen}`
    const draw = path.animate([{ strokeDashoffset: screen }, { strokeDashoffset: 0 }], { duration: DRAW_MS, easing: DRAW_EASE, fill: 'none' })
    draw.onfinish = () => {
      path.style.strokeDasharray = ink
      path.dataset.drawn = 'done'
    }
    return () => {
      // A new step ends this draw: the line goes back to the ink and dash it had.
      draw.cancel()
      path.style.strokeDasharray = ink
    }
  }, [highlighted, flow])
  if (!data) return null
  const unknown = data.kind === 'unknown'
  const text = unknown ? `Meaning unknown: ${data.label}` : data.label
  const style = KIND_STYLE[data.kind]
  const ends = `${source} ${target}`
  const emphasized = selected || data.active || data.highlighted
  const ink = data.edited ? 'var(--yours)' : `var(--line-ink, ${LINE_INK})`
  return (
    <>
      {data.ghost && (
        <path
          className={styles.ghost}
          d={data.ghost}
          style={{ stroke: LINE_INK, strokeWidth: style.width, strokeDasharray: style.dash || undefined }}
          aria-hidden="true"
        />
      )}
      <g
        ref={line}
        className={styles.line}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        data-dimmed={data.dimmed || undefined}
        data-faded={data.faded || undefined}
        data-highlighted={data.highlighted || undefined}
        data-active={emphasized || undefined}
        data-ends={ends}
        data-edge={id}
      >
        <BaseEdge
          id={id}
          path={data.path}
          {...(markerEnd ? { markerEnd } : {})}
          interactionWidth={interactionWidth ?? 28}
          style={{
            stroke: emphasized ? 'var(--accent-line)' : ink,
            strokeWidth: emphasized ? Math.max(SELECTED_WIDTH, style.width) : style.width,
            strokeDasharray: style.dash || undefined,
            strokeLinecap: style.dash.startsWith('1.5') ? 'round' : 'butt',
          }}
        />
      </g>
      <EdgeLabelRenderer>
        <div
          className={clsx(styles.pill, 'nodrag nopan')}
          data-label=""
          data-ends={ends}
          data-edge={id}
          data-selected={selected || undefined}
          data-active={data.active || undefined}
          data-highlighted={data.highlighted || undefined}
          data-dimmed={data.dimmed || undefined}
          data-faded={data.faded || undefined}
          data-moving={data.moving || undefined}
          data-hidden={data.labelHidden || undefined}
          data-hover={hover || undefined}
          data-kind={data.kind}
          data-edited={data.edited || undefined}
          data-revision={data.revision}
          style={{ transform: `translate(-50%, -50%) translate(${data.labelX}px, ${data.labelY}px)`, ...(data.labelHidden ? {} : { '--label-width': `${data.labelWidth}px` }) } as CSSProperties}
          title={text}
          aria-hidden="true"
          onClick={() => dispatch({ type: 'select', selection: { type: 'relationship', id: data.relationshipId } })}
        >
          <LabelCutout tint={data.tint}>
            {unknown && <CircleHelp className={styles.unknown} size={12} strokeWidth={1.5} aria-hidden="true" />}
            {data.label}
          </LabelCutout>
        </div>
        {/*
          What the open revision did to this connection: one word in a tab against its label, on the first side clear of cards.
          It sits beside the label, not in it, so a selected label that clips its text never clips the tab. The line's name says it to a screen reader.
        */}
        {data.revision && (
          <div
            className={clsx(styles.revision, 'nodrag nopan')}
            data-edge-revision={data.revision}
            data-edge={id}
            data-hidden={data.labelHidden || undefined}
            data-moving={data.moving || undefined}
            data-faded={data.faded || undefined}
            data-arriving={data.arriving || undefined}
            data-at={data.revisionAt ?? 'above'}
            style={{ transform: tabTransform(data.revisionAt ?? 'above', data.labelX, data.labelY, data.labelWidth, pillHeight(data.labelLines)) }}
            aria-hidden="true"
          >
            {data.revision === 'new' ? 'New' : 'Changed'}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
})
