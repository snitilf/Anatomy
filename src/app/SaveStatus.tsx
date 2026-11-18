import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useAppStore } from './store'
import buttons from './buttons.module.css'
import { storageProblem, useWorkspace } from './workspaceContext'
import styles from './SaveStatus.module.css'

/** A write shorter than this never says "Saving". A save is not news until it is slow or has failed. */
const SLOW_MS = 1000

/** Says nothing while the work is saved. It speaks for a slow save and for a failed one, with a way out. */
export function SaveStatus() {
  const hasBoard = useAppStore((s) => s.board !== undefined)
  const { save, retrySave, exportNow } = useWorkspace()
  const saving = save.kind === 'saving'
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!saving) return
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => {
      window.clearTimeout(timer)
      setSlow(false)
    }
  }, [saving])

  if (!hasBoard || save.kind === 'none') return null
  if (save.kind === 'error') {
    return (
      <div className={styles.failed} role="alert">
        <span className={styles.text}>
          Not saved
          <span className="sr-only">. {storageProblem(save.error)}.</span>
        </span>
        {save.error.kind !== 'unavailable' && (
          <button type="button" className={clsx(buttons.button, buttons.quiet, buttons.small)} onClick={retrySave}>
            Try again
          </button>
        )}
        <button type="button" className={clsx(buttons.button, buttons.quiet, buttons.small)} onClick={exportNow}>
          Download a copy
        </button>
      </div>
    )
  }
  // One live region that stays mounted, so a screen reader hears the text arrive. It is empty, and takes no room, until a save is slow.
  return (
    <p className={styles.line} role="status" data-save-state={save.kind}>
      {saving && slow ? 'Saving' : ''}
    </p>
  )
}
