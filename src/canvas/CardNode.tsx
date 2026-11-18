import { Handle, NodeResizeControl, Position, useStore, type Node, type NodeProps } from '@xyflow/react'
import { GraduationCap } from 'lucide-react'
import { memo } from 'react'
import { CARD_MAX, CARD_MIN } from '../layout/cards'
import { StatusGlyph } from '../status/StatusGlyph'
import { noteBadgeLabel } from '../status/state'
import { nameLines } from './far'
import { useTipClamp } from './useTipClamp'
import { EDGE_IN_HANDLE, EDGE_OUT_HANDLE, SIDE_POSITION, type CardData, type Side } from './buildGraph'
import styles from './CardNode.module.css'

/** Below this zoom a summary would draw under 9px on screen, so the card shows its title alone. */
export const SUMMARY_ZOOM = 0.75

const SIDES = Object.keys(SIDE_POSITION) as Side[]

export const CardNode = memo(function CardNode({ data, selected }: NodeProps<Node<CardData>>) {
  const mine = data.noteCount
  const small = useStore((s) => s.transform[2] < SUMMARY_ZOOM)
  // A tile wide enough on screen carries the part's name in the far view. It renders on the crossing, not on every zoom.
  const lines = useStore((s) => (data.far ? nameLines(s.transform[2], data.width, data.height) : 0))
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
        data-selected={selected || undefined}
        data-highlighted={data.highlighted ? 'true' : undefined}
        data-dimmed={data.dimmed ? 'true' : undefined}
        data-faded={data.faded ? 'true' : undefined}
        data-proposal={data.sourceKind === 'agent-proposal' || undefined}
      >
        {data.far && mine > 0 && <span className={styles.dot} aria-hidden="true" />}
        {lines > 0 && (
          <div className={styles.tileName} data-lines={lines} aria-hidden="true">
            {data.label}
          </div>
        )}
        <div className={styles.label}>{data.label}</div>
        <p className={styles.summary} style={{ WebkitLineClamp: data.summaryLines }} data-small={small || undefined}>
          {data.summary}
        </p>
        {(data.hasLesson || mine > 0) && (
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
