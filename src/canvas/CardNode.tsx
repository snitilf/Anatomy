import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { SourceBadge } from '../app/SourceBadge'
import { EDGE_IN_HANDLE, EDGE_OUT_HANDLE, SIDE_POSITION, type CardData, type Side } from './buildGraph'
import styles from './CardNode.module.css'

const SIDES = Object.keys(SIDE_POSITION) as Side[]

export const CardNode = memo(function CardNode({ data, selected }: NodeProps<Node<CardData>>) {
  const mine = data.noteCount
  // The dots sit beside the card, not inside it: the card clips its own paint.
  return (
    <>
      <Handle id={EDGE_IN_HANDLE} type="target" position={Position.Top} isConnectable={false} className={styles.handle} />
      <Handle id={EDGE_OUT_HANDLE} type="source" position={Position.Top} isConnectable={false} className={styles.handle} />
      {SIDES.map((side) => (
        <Handle key={`out-${side}`} id={`out-${side}`} type="source" position={SIDE_POSITION[side]} className={styles.drawHandle} />
      ))}
      <div
        className={styles.card}
        data-selected={selected || undefined}
        data-highlighted={data.highlighted ? 'true' : undefined}
        data-dimmed={data.dimmed ? 'true' : undefined}
      >
        <div className={styles.meta}>
          <SourceBadge kind={data.sourceKind} />
          <span className={styles.badges}>
            {data.hasLesson && <span className={styles.lesson}>Lesson</span>}
            {mine > 0 && (
              <span className={styles.mine} role="img" aria-label={`${mine} ${mine === 1 ? 'note or question' : 'notes or questions'} from you`}>
                <span aria-hidden="true">You</span>
                <b aria-hidden="true">{mine}</b>
              </span>
            )}
          </span>
        </div>
        <h3 className={styles.label}>{data.label}</h3>
        <p className={styles.summary}>{data.summary}</p>
      </div>
    </>
  )
})
