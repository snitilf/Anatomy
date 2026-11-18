import clsx from 'clsx'
import { memo, useState, type CSSProperties } from 'react'
import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react'
import { useAppDispatch } from '../app/store'
import type { ManualEdgeData } from './buildGraph'
import { MANUAL_STYLE, SELECTED_WIDTH } from './kinds'
import styles from './RelationshipEdge.module.css'

/** An arrow the user drew. It never looks like a connection the agent supplied. */
export const ManualEdge = memo(function ManualEdge(props: EdgeProps<Edge<ManualEdgeData>>) {
  const { id, data, selected, markerEnd, interactionWidth, source, target } = props
  const dispatch = useAppDispatch()
  const [hover, setHover] = useState(false)
  if (!data) return null
  const ends = `${source} ${target}`
  const emphasized = selected || data.active
  return (
    <>
      <g className={styles.line} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} data-faded={data.faded || undefined} data-active={emphasized || undefined} data-ends={ends} data-edge={id}>
        <BaseEdge
          id={id}
          path={data.path}
          {...(markerEnd ? { markerEnd } : {})}
          interactionWidth={interactionWidth ?? 28}
          style={{
            stroke: emphasized ? 'var(--accent-line)' : 'var(--yours)',
            strokeWidth: emphasized ? SELECTED_WIDTH : MANUAL_STYLE.width,
            strokeDasharray: MANUAL_STYLE.dash,
            strokeLinecap: 'round',
          }}
        />
      </g>
      <EdgeLabelRenderer>
        <div
          className={clsx(styles.pill, styles.mine, 'nodrag nopan')}
          data-label=""
          data-ends={ends}
          data-edge={id}
          data-selected={selected || undefined}
          data-active={data.active || undefined}
          data-mine=""
          data-faded={data.faded || undefined}
          data-moving={data.moving || undefined}
          data-hidden={data.labelHidden || undefined}
          data-hover={hover || undefined}
          data-depth={data.depth || undefined}
          style={{ transform: `translate(-50%, -50%) translate(${data.labelX}px, ${data.labelY}px)`, ...(data.labelHidden ? {} : { '--label-width': `${data.labelWidth}px` }) } as CSSProperties}
          title={data.hasLabel ? data.text : undefined}
          onClick={() => dispatch({ type: 'select', selection: { type: 'link', id: data.linkId } })}
        >
          <span className={styles.cutout}>{data.text}</span>
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
