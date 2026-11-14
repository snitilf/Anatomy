import clsx from 'clsx'
import buttons from './buttons.module.css'
import { ExamplesMenu } from './ExamplesMenu'
import styles from './EmptyState.module.css'
import { storageProblem, useWorkspace } from './workspaceContext'
import { SavedBoardList } from './SavedBoards'

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

/** The first line and the main actions, which depend on whether a repository folder is open or remembered. */
function Lead({ onOpen, onHowTo }: { onOpen: () => void; onHowTo: () => void }) {
  const { folder, canOpenFolder, openFolder, reopenFolder } = useWorkspace()
  if (folder?.state === 'missing') {
    return (
      <>
        <p className={styles.line}>{folder.name} has no .anatomy/board.json yet.</p>
        <p className={styles.hint}>It opens here as soon as your agent writes it.</p>
        <div className={styles.actions}>
          <button type="button" className={clsx(buttons.button, buttons.primary)} onClick={onHowTo}>
            How to make a board
          </button>
          <ExamplesMenu label="Load an example" />
        </div>
      </>
    )
  }
  return (
    <>
      <p className={styles.line}>Open a board to see how it fits together.</p>
      <div className={styles.actions}>
        {folder?.state === 'reopen' && (
          <button type="button" className={clsx(buttons.button, buttons.primary)} onClick={reopenFolder}>
            Reopen {folder.name}
          </button>
        )}
        {canOpenFolder && folder?.state !== 'reopen' && (
          <button type="button" className={clsx(buttons.button, buttons.primary)} onClick={openFolder}>
            Open repository folder
          </button>
        )}
        <ExamplesMenu label="Load an example" primary={!canOpenFolder} />
        <button type="button" className={buttons.button} onClick={onOpen}>
          Open board file
        </button>
      </div>
    </>
  )
}

export function EmptyState({ onOpen, onHowTo }: { onOpen: () => void; onHowTo: () => void }) {
  const { saved, unavailable } = useWorkspace()
  return (
    <div className={styles.empty}>
      <Sketch />
      <Lead onOpen={onOpen} onHowTo={onHowTo} />
      {unavailable && (
        <p className={styles.problem} role="status">
          {storageProblem(unavailable)}, so nothing you open is saved. Export keeps your work.
        </p>
      )}
      {saved.length > 0 && (
        <section className={styles.saved} aria-labelledby="saved-title">
          <h2 className={styles.savedTitle} id="saved-title">
            Saved in this browser
          </h2>
          <SavedBoardList />
        </section>
      )}
    </div>
  )
}
