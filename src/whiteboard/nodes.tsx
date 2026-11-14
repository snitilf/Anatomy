import { Handle, NodeResizeControl, Position, type Node, type NodeProps } from '@xyflow/react'
import { StickyNote } from 'lucide-react'
import { memo } from 'react'
import { CARD_MAX, CARD_MIN } from '../layout/cards'
import { EDGE_IN_HANDLE, EDGE_OUT_HANDLE, SIDE_POSITION, type MarkNodeData, type ProposalData, type Side } from '../canvas/buildGraph'
import cards from '../canvas/CardNode.module.css'
import styles from './nodes.module.css'
import { STICKY_MAX, STICKY_MIN } from './sizes'

const SIDES = Object.keys(SIDE_POSITION) as Side[]

/** The corner grip that resizes a node. */
function Grip({ min, max }: { min: { width: number; height: number }; max: { width: number; height: number } }) {
  return (
    <NodeResizeControl position="bottom-right" className={cards.resize ?? ''} minWidth={min.width} minHeight={min.height} maxWidth={max.width} maxHeight={max.height}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M9 3 L3 9 M9 6.5 L6.5 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" fill="none" />
      </svg>
    </NodeResizeControl>
  )
}

/** A part the user proposed: a card in the user's color, linked and moved like any part. */
export const ProposalNode = memo(function ProposalNode({ data, selected }: NodeProps<Node<ProposalData>>) {
  return (
    <>
      <Handle id={EDGE_IN_HANDLE} type="target" position={Position.Top} isConnectable={false} className={cards.handle} />
      <Handle id={EDGE_OUT_HANDLE} type="source" position={Position.Top} isConnectable={false} className={cards.handle} />
      {SIDES.map((side) => (
        <Handle key={`out-${side}`} id={`out-${side}`} type="source" position={SIDE_POSITION[side]} className={cards.drawHandle} />
      ))}
      <div className={cards.card} data-yours="" data-selected={selected || undefined}>
        <h3 className={cards.label}>{data.label}</h3>
        {data.summary && (
          <p className={cards.summary} style={{ WebkitLineClamp: data.summaryLines }}>
            {data.summary}
          </p>
        )}
        {data.noteCount > 0 && (
          <div className={cards.foot}>
            <span className={cards.mine} role="img" aria-label={`${data.noteCount} ${data.noteCount === 1 ? 'note or question' : 'notes or questions'} from you`}>
              <StickyNote size={14} strokeWidth={1.5} aria-hidden="true" />
              <span aria-hidden="true">{data.noteCount}</span>
            </span>
          </div>
        )}
      </div>
      <Grip min={CARD_MIN} max={CARD_MAX} />
    </>
  )
})

/** A sticky note: a square of the user's tint with their words on it. */
export const StickyNode = memo(function StickyNode({ data, selected }: NodeProps<Node<MarkNodeData>>) {
  return (
    <>
      <div className={styles.sticky} data-selected={selected || undefined} data-empty={data.mark.text === '' || undefined}>
        {data.mark.text}
      </div>
      <Grip min={STICKY_MIN} max={STICKY_MAX} />
    </>
  )
})

/** Words written straight on the map, in the user's color. */
export const TextNode = memo(function TextNode({ data, selected }: NodeProps<Node<MarkNodeData>>) {
  return (
    <div className={styles.text} data-selected={selected || undefined}>
      {data.mark.text}
    </div>
  )
})
