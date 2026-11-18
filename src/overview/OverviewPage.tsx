import { useAppStore } from '../app/store'
import styles from './Overview.module.css'

/** The Overview view of a board: one calm page that covers the map. */
export function OverviewPage() {
  const title = useAppStore((s) => s.board?.title)
  return (
    <div className={styles.page} data-testid="overview" role="region" aria-label="Overview">
      <div className={styles.column}>
        <h2 className={styles.title}>{title}</h2>
      </div>
    </div>
  )
}
