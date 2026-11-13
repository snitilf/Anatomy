import buttons from './buttons.module.css'
import { ExamplesMenu } from './ExamplesMenu'
import styles from './EmptyState.module.css'

export function EmptyState({ onOpen, onHowTo }: { onOpen: () => void; onHowTo: () => void }) {
  return (
    <div className={styles.empty}>
      <p className={styles.line}>Open a board file your agent wrote, and see how it fits together.</p>
      <div className={styles.actions}>
        <button type="button" className={`${buttons.button} ${buttons.primary}`} onClick={onOpen}>
          Open board
        </button>
        <ExamplesMenu label="Load an example" />
        <button type="button" className={`${buttons.button} ${buttons.quiet}`} onClick={onHowTo}>
          How to make a board
        </button>
      </div>
    </div>
  )
}
