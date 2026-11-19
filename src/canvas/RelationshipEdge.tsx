import clsx from 'clsx'
import { CircleHelp } from 'lucide-react'
import { memo, useState, type CSSProperties } from 'react'
import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react'
import { useAppDispatch } from '../app/store'
import type { EdgeData } from './buildGraph'
import { KIND_STYLE, SELECTED_WIDTH, LINE_INK } from './kinds'
import styles from './RelationshipEdge.module.css'

export const RelationshipEdge = memo(function RelationshipEdge(props: EdgeProps<Edge<EdgeData>>) {
  const { id, data, selected, markerEnd, interactionWidth, source, target } = props
  const dispatch = useAppDispatch()
  const [hover, setHover] = useState(false)
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
      <g className={styles.line} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} data-dimmed={data.dimmed || undefined} data-faded={data.faded || undefined} data-highlighted={data.highlighted || undefined} data-active={emphasized || undefined} data-ends={ends} data-edge={id}>
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
          data-depth={data.depth || undefined}
          data-kind={data.kind}
          data-edited={data.edited || undefined}
          style={{ transform: `translate(-50%, -50%) translate(${data.labelX}px, ${data.labelY}px)`, ...(data.labelHidden ? {} : { '--label-width': `${data.labelWidth}px` }) } as CSSProperties}
          title={text}
          aria-hidden="true"
          onClick={() => dispatch({ type: 'select', selection: { type: 'relationship', id: data.relationshipId } })}
        >
          <span className={styles.cutout}>
            {unknown && <CircleHelp className={styles.unknown} size={12} strokeWidth={1.5} aria-hidden="true" />}
            {data.label}
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
