import clsx from 'clsx'
import { memo, type CSSProperties } from 'react'
import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react'
import { useAppDispatch } from '../app/store'
import type { ManualEdgeData } from './buildGraph'
import { MANUAL_STYLE, SELECTED_WIDTH } from './kinds'
import styles from './RelationshipEdge.module.css'

/** An arrow the user drew. It never looks like a connection the agent supplied. */
export const ManualEdge = memo(function ManualEdge(props: EdgeProps<Edge<ManualEdgeData>>) {
  const { id, data, selected, markerEnd, interactionWidth } = props
  const dispatch = useAppDispatch()
  if (!data) return null
  const emphasized = selected || data.active
  return (
    <>
      <g className={styles.line} data-faded={data.faded || undefined}>
        <BaseEdge
          id={id}
          path={data.path}
          {...(markerEnd ? { markerEnd } : {})}
          interactionWidth={interactionWidth ?? 28}
          style={{
            stroke: emphasized ? 'var(--accent)' : 'var(--ink)',
            strokeWidth: selected ? SELECTED_WIDTH : MANUAL_STYLE.width,
            strokeDasharray: MANUAL_STYLE.dash,
            strokeLinecap: 'round',
          }}
        />
      </g>
      <EdgeLabelRenderer>
        <div
          className={clsx(styles.pill, styles.mine, 'nodrag nopan')}
          data-selected={selected || undefined}
          data-active={data.active || undefined}
          data-faded={data.faded || undefined}
          style={{ transform: `translate(-50%, -50%) translate(${data.labelX}px, ${data.labelY}px)`, '--label-width': `${data.labelWidth}px` } as CSSProperties}
          title={data.hasLabel ? data.text : undefined}
          onClick={() => dispatch({ type: 'select', selection: { type: 'link', id: data.linkId } })}
        >
          {data.hasLabel && <span className={styles.chip}>You</span>}
          {data.text}
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
