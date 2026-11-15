import clsx from 'clsx'
import { CircleAlert, Info } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppDispatch, useAppStore } from './store'
import buttons from './buttons.module.css'
import styles from './Notices.module.css'

export function Notices() {
  const { openErrors, warnings } = useAppStore(useShallow((s) => ({ openErrors: s.openErrors, warnings: s.warnings })))
  const dispatch = useAppDispatch()
  return (
    <>
      {openErrors && (
        <section className={clsx(styles.panel, styles.error)} role="alert" aria-labelledby="open-error-title">
          <div className={styles.head}>
            <CircleAlert className={styles.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
            <h2 className={styles.title} id="open-error-title">
              <span className={styles.file}>{openErrors.fileName}</span> was not opened
            </h2>
            <span className={styles.count}>
              {openErrors.errors.length} {openErrors.errors.length === 1 ? 'problem' : 'problems'}
            </span>
            <button type="button" className={clsx(buttons.button, buttons.quiet)} onClick={() => dispatch({ type: 'dismissErrors' })}>
              Dismiss
            </button>
          </div>
          <ul className={styles.list}>
            {openErrors.errors.map((e, i) => (
              <li key={i} className={styles.problem}>
                {e.path !== '' && <code className={styles.path}>{e.path}</code>}
                <span>{e.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {warnings.length > 0 && (
        <section className={clsx(styles.panel, styles.warning)} role="status" aria-label="Notice">
          <div className={styles.head}>
            <Info className={styles.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
            <ul className={styles.list}>
              {warnings.map((w, i) => (
                <li key={i} className={styles.problem}>
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
            <button type="button" className={clsx(buttons.button, buttons.quiet)} onClick={() => dispatch({ type: 'dismissWarnings' })}>
              Dismiss
            </button>
          </div>
        </section>
      )}
    </>
  )
}
