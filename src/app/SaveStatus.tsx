import clsx from 'clsx'
import { CircleAlert } from 'lucide-react'
import { useAppStore } from './store'
import buttons from './buttons.module.css'
import { storageProblem, useWorkspace } from './workspaceContext'
import styles from './SaveStatus.module.css'

/** Whether the work is in browser storage, and a way out when it is not. Always shown while a board is open. */
export function SaveStatus() {
  const hasBoard = useAppStore((s) => s.board !== undefined)
  const { save, retrySave, exportNow } = useWorkspace()
  if (!hasBoard || save.kind === 'none') return null
  return (
    <div className={styles.root}>
      {save.kind === 'error' ? (
        <div className={styles.failed} role="alert" title={storageProblem(save.error)}>
          <CircleAlert className={styles.alert} size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className={styles.text}>
            <strong>Not saved</strong>
            <span className="sr-only">. {storageProblem(save.error)}</span>
          </span>
          {save.error.kind !== 'unavailable' && (
            <button type="button" className={clsx(buttons.button, buttons.quiet)} onClick={retrySave}>
              Try again
            </button>
          )}
          <button type="button" className={buttons.button} onClick={exportNow}>
            Export
          </button>
        </div>
      ) : (
        <p className={styles.line} role="status" data-state={save.kind} title={save.kind === 'saved' ? (save.where === 'folder' ? 'Saved to .anatomy/layer.json' : 'Saved in this browser') : undefined}>
          {save.kind === 'saving' ? 'Saving' : 'Saved'}
        </p>
      )}
    </div>
  )
}
