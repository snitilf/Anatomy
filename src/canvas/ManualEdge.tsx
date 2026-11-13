import type { CSSProperties } from 'react'
import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react'
import { useAppDispatch } from '../app/appContext'
import type { ManualEdgeData } from './buildGraph'
import { MANUAL_STYLE } from './kinds'
import styles from './RelationshipEdge.module.css'

/** An arrow the user drew. It never looks like a connection the agent supplied. */
export function ManualEdge(props: EdgeProps<Edge<ManualEdgeData>>) {
  const { id, data, selected, markerEnd, interactionWidth } = props
  const dispatch = useAppDispatch()
  if (!data) return null
  const emphasized = selected || data.active
  return (
    <>
      <g className={styles.line}>
        <BaseEdge
          id={id}
          path={data.path}
          {...(markerEnd ? { markerEnd } : {})}
          interactionWidth={interactionWidth ?? 28}
          style={{
            stroke: emphasized ? 'var(--accent)' : 'var(--ink)',
            strokeWidth: selected ? MANUAL_STYLE.width + 1 : MANUAL_STYLE.width,
            strokeDasharray: MANUAL_STYLE.dash,
            strokeLinecap: 'round',
          }}
        />
      </g>
      <EdgeLabelRenderer>
        <div
          className={`${styles.pill} ${styles.mine} nodrag nopan`}
          data-selected={selected || undefined}
          data-active={data.active || undefined}
          style={{ transform: `translate(-50%, -50%) translate(${data.labelX}px, ${data.labelY}px)`, '--label-width': `${data.labelWidth}px` } as CSSProperties}
          onClick={() => dispatch({ type: 'select', selection: { type: 'link', id: data.linkId } })}
        >
          {data.hasLabel && <span className={styles.chip}>You</span>}
          {data.text}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
