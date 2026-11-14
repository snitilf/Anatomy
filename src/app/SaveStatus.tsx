import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useAppStore } from './store'
import buttons from './buttons.module.css'
import { Tip } from './Tip'
import { storageProblem, useWorkspace } from './workspaceContext'
import styles from './SaveStatus.module.css'

/** A write shorter than this never says "Saving", so the status does not flicker on every change. */
const SLOW_MS = 300

/** Whether the work is saved, and a way out when it is not. Shown while a board is open. */
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
  const where = save.kind === 'saved' && save.where === 'folder' ? 'Saved to .anatomy/layer.json' : 'Saved in this browser'
  return (
    <Tip label={where}>
      <p className={styles.line} role="status" data-state={save.kind}>
        {saving && slow ? 'Saving' : 'Saved'}
      </p>
    </Tip>
  )
}
