import { Handle, type Node, type NodeProps } from '@xyflow/react'
import { useAppState } from '../app/appContext'
import { SourceBadge } from '../app/SourceBadge'
import { SIDE_POSITION, type CardData, type Side } from './buildGraph'
import styles from './CardNode.module.css'

const SIDES = Object.keys(SIDE_POSITION) as Side[]

export function CardNode({ data, selected }: NodeProps<Node<CardData>>) {
  const { board } = useAppState()
  const component = board?.components.find((c) => c.id === data.componentId)
  if (!component) return null
  return (
    <div
      className={styles.card}
      data-selected={selected || undefined}
      data-highlighted={data.highlighted ? 'true' : undefined}
      data-dimmed={data.dimmed ? 'true' : undefined}
    >
      {SIDES.map((side) => (
        <Handle key={`in-${side}`} id={`in-${side}`} type="target" position={SIDE_POSITION[side]} isConnectable={false} className={styles.handle} />
      ))}
      {SIDES.map((side) => (
        <Handle key={`out-${side}`} id={`out-${side}`} type="source" position={SIDE_POSITION[side]} isConnectable={false} className={styles.handle} />
      ))}
      <div className={styles.meta}>
        <SourceBadge kind={component.source.kind} />
        {component.lesson && <span className={styles.lesson}>Lesson</span>}
      </div>
      <h3 className={styles.label}>{component.label}</h3>
      <p className={styles.summary}>{component.summary}</p>
    </div>
  )
}
