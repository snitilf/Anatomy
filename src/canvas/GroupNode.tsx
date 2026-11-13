import type { Node, NodeProps } from '@xyflow/react'
import type { GroupData } from './buildGraph'
import styles from './GroupNode.module.css'

export function GroupNode({ data }: NodeProps<Node<GroupData>>) {
  return (
    <div className={styles.area} aria-hidden="true">
      <span className={styles.label}>{data.label}</span>
    </div>
  )
}
