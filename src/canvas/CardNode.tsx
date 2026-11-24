import { Handle, NodeResizeControl, Position, useStore, type Node, type NodeProps } from '@xyflow/react'
import { GraduationCap } from 'lucide-react'
import { memo, type CSSProperties } from 'react'
import { CARD_MAX, CARD_MIN } from '../layout/cards'
import { StatusGlyph } from '../status/StatusGlyph'
import { noteBadgeLabel } from '../status/state'
import { startsLabel } from '../scenarios/starts'
import { nameLines, titleLines } from './far'
import { useTipClamp } from './useTipClamp'
import { EDGE_IN_HANDLE, EDGE_OUT_HANDLE, SIDE_POSITION, type CardData, type Side } from './buildGraph'
import styles from './CardNode.module.css'

const SIDES = Object.keys(SIDE_POSITION) as Side[]

export const CardNode = memo(function CardNode({ data, selected }: NodeProps<Node<CardData>>) {
  const mine = data.noteCount
  // A tile wide enough on screen carries the part's name in the far view. It renders on the crossing, not on every zoom.
  const lines = useStore((s) => (data.far ? nameLines(s.transform[2], data.width, data.height) : 0))
  // How many title lines a title-only card holds. It changes only on a few zooms just above the far view.
  const foot = data.hasLesson || mine > 0
  const heading = useStore((s) => (data.far ? 3 : titleLines(s.transform[2], data.height, foot)))
  const tip = useTipClamp(data.far, selected === true || data.highlighted)
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
        data-card=""
        data-selected={selected || undefined}
        data-highlighted={data.highlighted ? 'true' : undefined}
        data-dimmed={data.dimmed ? 'true' : undefined}
        data-faded={data.faded ? 'true' : undefined}
        data-proposal={data.sourceKind === 'agent-proposal' || undefined}
        data-start={data.starts.length > 0 && !data.far ? data.startCorner : undefined}
        style={{ '--title-lines': heading } as CSSProperties}
      >
        {data.far && mine > 0 && <span className={styles.dot} aria-hidden="true" />}
        {/* Where a walkthrough starts: a small outlined play mark inside the card, in the ink of the other icons. A shape, not a color. */}
        {data.starts.length > 0 && !data.far && (
          <span className={styles.start} data-flow-start="" data-corner={data.startCorner} title={startsLabel(data.starts)} aria-hidden="true">
            <svg viewBox="0 0 16 16" width="100%" height="100%">
              <path d="M6.3 4.9 L11.2 8 L6.3 11.1 Z" />
            </svg>
          </span>
        )}
        {lines > 0 && (
          <div className={styles.tileName} data-lines={lines} aria-hidden="true">
            {data.label}
          </div>
        )}
        <div className={styles.label}>{data.label}</div>
        <p className={styles.summary} style={{ WebkitLineClamp: data.summaryLines }}>
          {data.summary}
        </p>
        {foot && (
          <div className={styles.foot}>
            {data.hasLesson && (
              <span className={styles.lesson} role="img" aria-label="Has a lesson" title="Has a lesson">
                <GraduationCap size={14} strokeWidth={1.5} aria-hidden="true" />
              </span>
            )}
            {mine > 0 && (
              <span className={styles.mine} data-state={data.noteState} role="img" aria-label={noteBadgeLabel(mine, data.noteState, data.noteStateCount)}>
                <StatusGlyph state={data.noteState} withWord />
                <span aria-hidden="true">{mine}</span>
              </span>
            )}
          </div>
        )}
      </div>
      {/* The name of the part in the far view, where the tile has no text. The card clips its own paint, so it sits beside it. */}
      {data.far && (
        <div ref={tip} className={styles.tip} aria-hidden="true">
          {data.label}
        </div>
      )}
      <NodeResizeControl
        position="bottom-right"
        className={styles.resize ?? ''}
        minWidth={CARD_MIN.width}
        minHeight={CARD_MIN.height}
        maxWidth={CARD_MAX.width}
        maxHeight={CARD_MAX.height}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M9 3 L3 9 M9 6.5 L6.5 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" fill="none" />
        </svg>
      </NodeResizeControl>
    </>
  )
})
