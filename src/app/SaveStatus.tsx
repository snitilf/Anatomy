import clsx from 'clsx'
import { useAppStore } from './store'
import buttons from './buttons.module.css'
import { storageProblem, usePersistence } from './persistenceContext'
import styles from './SaveStatus.module.css'

/** Whether the work is in browser storage, and a way out when it is not. Always shown while a board is open. */
export function SaveStatus() {
  const hasBoard = useAppStore((s) => s.board !== undefined)
  const { save, retrySave, exportNow } = usePersistence()
  if (!hasBoard || save.kind === 'none') return null
  return (
    <div className={styles.root}>
      {save.kind === 'error' ? (
        <div className={styles.failed} role="alert">
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.text}>
            <strong>Not saved</strong>
            <span className={styles.reason}>{storageProblem(save.error)}</span>
          </span>
          {save.error.kind !== 'unavailable' && (
            <button type="button" className={clsx(buttons.button, buttons.quiet, styles.small)} onClick={retrySave}>
              Try again
            </button>
          )}
          <button type="button" className={clsx(buttons.button, styles.small)} onClick={exportNow}>
            Export
          </button>
        </div>
      ) : (
        <p className={styles.line} role="status" data-state={save.kind}>
          <span className={styles.dot} aria-hidden="true" />
          {save.kind === 'saving' ? 'Saving' : 'Saved in this browser'}
        </p>
      )}
    </div>
  )
}
