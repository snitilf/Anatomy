import type { SourceKind } from '../board/schema'
import { SOURCE_LABEL } from './labels'
import styles from './SourceBadge.module.css'

export function SourceBadge({ kind }: { kind: SourceKind }) {
  return (
    <span className={`${styles.badge} ${styles[kind]}`} data-source={kind}>
      {SOURCE_LABEL[kind]}
    </span>
  )
}
