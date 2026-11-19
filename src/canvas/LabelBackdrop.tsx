import { useMemo } from 'react'
import { readTint } from './labelTint'
import styles from './RelationshipEdge.module.css'

/** The cutout under a label: the map color, with each group area under the label painted on it the way the map paints it. */
export function LabelBackdrop({ tint }: { tint: string }) {
  const areas = useMemo(() => readTint(tint), [tint])
  return (
    <span className={styles.backdrop} aria-hidden="true">
      {areas.map((a, i) => (
        <span key={i} className={styles.tint} style={{ left: `calc(50% + ${a.left}px)`, top: `calc(50% + ${a.top}px)`, width: a.width, height: a.height }} />
      ))}
    </span>
  )
}
