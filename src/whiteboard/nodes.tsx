import { Handle, NodeResizeControl, Position, useStore, type Node, type NodeProps } from '@xyflow/react'
import { memo, useLayoutEffect, useRef, useState } from 'react'
import { CARD_MAX, CARD_MIN } from '../layout/cards'
import { EDGE_IN_HANDLE, EDGE_OUT_HANDLE, SIDE_POSITION, type MarkNodeData, type ProposalData, type Side } from '../canvas/buildGraph'
import cards from '../canvas/CardNode.module.css'
import styles from './nodes.module.css'
import { STICKY_MAX, STICKY_MIN } from './sizes'
import { nameLines } from '../canvas/far'
import { StatusGlyph } from '../status/StatusGlyph'
import { noteBadgeLabel } from '../status/state'

/** Whether the words run past the box they sit in, so the box can fade them out instead of cutting a line in half. */
function useClipped(text: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [text])
  return [ref, clipped || undefined] as const
}

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
  const lines = useStore((s) => (data.far ? nameLines(s.transform[2], data.width, data.height) : 0))
  return (
    <>
      <Handle id={EDGE_IN_HANDLE} type="target" position={Position.Top} isConnectable={false} className={cards.handle} />
      <Handle id={EDGE_OUT_HANDLE} type="source" position={Position.Top} isConnectable={false} className={cards.handle} />
      {SIDES.map((side) => (
        <Handle key={`out-${side}`} id={`out-${side}`} type="source" position={SIDE_POSITION[side]} className={cards.drawHandle} />
      ))}
      <div className={cards.card} data-yours="" data-selected={selected || undefined}>
        {data.far && data.noteCount > 0 && <span className={cards.dot} aria-hidden="true" />}
        {lines > 0 && (
          <div className={cards.tileName} data-lines={lines} aria-hidden="true">
            {data.label}
          </div>
        )}
        <div className={cards.label}>{data.label}</div>
        {data.summary && (
          <p className={cards.summary} style={{ WebkitLineClamp: data.summaryLines }}>
            {data.summary}
          </p>
        )}
        {data.noteCount > 0 && (
          <div className={cards.foot}>
            <span className={cards.mine} data-state={data.noteState} role="img" aria-label={noteBadgeLabel(data.noteCount, data.noteState, data.noteStateCount)}>
              <StatusGlyph state={data.noteState} withWord />
              <span aria-hidden="true">{data.noteCount}</span>
            </span>
          </div>
        )}
      </div>
      {data.far && (
        <div className={cards.tip} aria-hidden="true">
          {data.label}
        </div>
      )}
      <Grip min={CARD_MIN} max={CARD_MAX} />
    </>
  )
})

/** A sticky note: a square of the user's tint with their words on it. */
export const StickyNode = memo(function StickyNode({ data, selected }: NodeProps<Node<MarkNodeData>>) {
  const [ref, clipped] = useClipped(data.mark.text)
  return (
    <>
      <div ref={ref} className={styles.sticky} data-clipped={clipped} data-selected={selected || undefined} data-empty={data.mark.text === '' || undefined}>
        {data.mark.text}
      </div>
      <Grip min={STICKY_MIN} max={STICKY_MAX} />
    </>
  )
})

/** Words written straight on the map, in the user's color. */
export const TextNode = memo(function TextNode({ data, selected }: NodeProps<Node<MarkNodeData>>) {
  const [ref, clipped] = useClipped(data.mark.text)
  return (
    <div ref={ref} className={styles.text} data-clipped={clipped} data-selected={selected || undefined}>
      {data.mark.text}
    </div>
  )
})
