import buttons from './buttons.module.css'
import { ExamplesMenu } from './ExamplesMenu'
import styles from './EmptyState.module.css'
import { storageProblem, usePersistence } from './persistenceContext'
import { SavedBoardList } from './SavedBoards'
import { NAMESPACES } from '../persistence/store'

export function EmptyState({ onOpen, onHowTo }: { onOpen: () => void; onHowTo: () => void }) {
  const { saved, space, unavailable } = usePersistence()
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
      {unavailable && (
        <p className={styles.problem} role="status">
          {storageProblem(unavailable)}, so nothing you open will be saved. Export keeps your work.
        </p>
      )}
      {saved.length > 0 && (
        <section className={styles.saved} aria-labelledby="saved-title">
          <h2 className={styles.savedTitle} id="saved-title">
            Saved in this browser, {NAMESPACES[space]}
          </h2>
          <SavedBoardList />
        </section>
      )}
    </div>
  )
}
