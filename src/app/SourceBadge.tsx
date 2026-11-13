import clsx from 'clsx'
import type { SourceKind } from '../board/schema'
import { SOURCE_LABEL, SOURCE_MEANING } from './labels'
import styles from './SourceBadge.module.css'

/** `explain` adds the one-sentence meaning as a tooltip. */
export function SourceBadge({ kind, explain = false }: { kind: SourceKind; explain?: boolean }) {
  return (
    <span className={clsx(styles.badge, styles[kind])} data-source={kind} title={explain ? SOURCE_MEANING[kind] : undefined}>
      {SOURCE_LABEL[kind]}
    </span>
  )
}
