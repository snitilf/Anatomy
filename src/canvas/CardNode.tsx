import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { GraduationCap, StickyNote } from 'lucide-react'
import { memo } from 'react'
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
        data-proposal={data.sourceKind === 'agent-proposal' || undefined}
      >
        <h3 className={styles.label}>{data.label}</h3>
        <p className={styles.summary}>{data.summary}</p>
        {(data.hasLesson || mine > 0) && (
          <div className={styles.foot}>
            {data.hasLesson && (
              <span className={styles.lesson} role="img" aria-label="Has a lesson" title="Has a lesson">
                <GraduationCap size={14} strokeWidth={1.5} aria-hidden="true" />
              </span>
            )}
            {mine > 0 && (
              <span className={styles.mine} role="img" aria-label={`${mine} ${mine === 1 ? 'note or question' : 'notes or questions'} from you`}>
                <StickyNote size={14} strokeWidth={1.5} aria-hidden="true" />
                <span aria-hidden="true">{mine}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </>
  )
})
