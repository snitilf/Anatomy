import clsx from 'clsx'
import buttons from './buttons.module.css'
import { ExamplesMenu } from './ExamplesMenu'
import styles from './EmptyState.module.css'
import { storageProblem, usePersistence } from './persistenceContext'
import { SavedBoardList } from './SavedBoards'
import { NAMESPACES } from '../persistence/store'

/** Three linked cards, drawn once. It shows what a board looks like before one is open. */
function Sketch() {
  return (
    <svg className={styles.sketch} viewBox="0 0 280 120" width="280" height="120" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path className={styles.link} d="M82 38h46m0 0l-6-5m6 5l-6 5" />
        <path className={styles.link} d="M180 62v20q0 14-14 14h-8m0 0l6-5m-6 5l6 5" />
        <rect className={styles.card} x="8" y="14" width="74" height="48" rx="8" />
        <rect className={styles.card} x="128" y="14" width="74" height="48" rx="8" />
        <rect className={styles.card} x="68" y="76" width="90" height="40" rx="8" />
      </g>
      <g className={styles.bars} stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M18 28h34M18 40h50M18 50h28" />
        <path d="M138 28h34M138 40h50M138 50h28" />
        <path d="M78 90h34M78 102h60" />
      </g>
    </svg>
  )
}

export function EmptyState({ onOpen, onHowTo }: { onOpen: () => void; onHowTo: () => void }) {
  const { saved, space, unavailable } = usePersistence()
  return (
    <div className={styles.empty}>
      <Sketch />
      <p className={styles.line}>Open a board to see how it fits together.</p>
      {space === 'work' && <p className={styles.space}>Work is kept apart from Home.</p>}
      <div className={styles.actions}>
        <ExamplesMenu label="Load an example" primary />
        <button type="button" className={buttons.button} onClick={onOpen}>
          Open board
        </button>
        <button type="button" className={clsx(buttons.button, buttons.quiet)} onClick={onHowTo}>
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
