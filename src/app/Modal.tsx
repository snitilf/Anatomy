import { useEffect, useId, useRef, type ReactNode } from 'react'
import styles from './Modal.module.css'

/** A native dialog that opens on mount. Escape and the backdrop-free close both call `onCancel`. */
export function Modal({ title, onCancel, children }: { title: string; onCancel: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = dialog.current
    if (!el || el.open) return
    if (typeof el.showModal === 'function') el.showModal()
    else el.setAttribute('open', '')
    return () => {
      if (el.open) {
        if (typeof el.close === 'function') el.close()
        else el.removeAttribute('open')
      }
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <div className={styles.body}>
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  )
}
