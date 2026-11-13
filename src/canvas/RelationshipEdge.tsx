import type { CSSProperties } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { useAppDispatch } from '../app/appContext'
import type { EdgeData } from './buildGraph'
import { KIND_STYLE, TONE_COLOR } from './kinds'
import styles from './RelationshipEdge.module.css'

export function RelationshipEdge(props: EdgeProps<Edge<EdgeData>>) {
  const { id, data, selected, markerEnd, interactionWidth } = props
  const dispatch = useAppDispatch()
  const [path] = getBezierPath(props)
  if (!data) return null
  const text = data.kind === 'unknown' ? `? ${data.label}` : data.label
  const style = KIND_STYLE[data.kind]
  const emphasized = selected || data.active
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        {...(markerEnd ? { markerEnd } : {})}
        interactionWidth={interactionWidth ?? 28}
        style={{
          stroke: emphasized ? 'var(--accent)' : TONE_COLOR[style.tone],
          strokeWidth: selected ? style.width + 1 : style.width,
          strokeDasharray: style.dash || undefined,
          strokeLinecap: style.dash.startsWith('1.5') ? 'round' : 'butt',
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={`${styles.pill} nodrag nopan`}
          data-selected={selected || undefined}
          data-active={data.active || undefined}
          data-kind={data.kind}
          style={{ transform: `translate(-50%, -50%) translate(${data.labelX}px, ${data.labelY}px)`, '--label-width': `${data.labelWidth}px` } as CSSProperties}
          onClick={() => dispatch({ type: 'select', selection: { type: 'relationship', id: data.relationshipId } })}
        >
          {text}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
