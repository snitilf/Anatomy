/* oxlint-disable react/static-components -- the lazy components are created once per lesson id, in loader.ts */
import { Suspense, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'
import buttons from '../app/buttons.module.css'
import { findLesson } from './catalog'
import { lessonComponent } from './loader'
import styles from './LessonDialog.module.css'

interface Props {
  lessonId: string
  onClose: () => void
}

/** A modal dialog that loads one built-in lesson. The caller returns focus to the opener. */
export function LessonDialog({ lessonId, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const entry = findLesson(lessonId)
  const Lesson = entry ? lessonComponent(entry) : null

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    // No cleanup. Removing the element ends the modal. A `close()` here would fire a close event
    // after a development remount and shut the dialog that just opened.
  }, [])

  return (
    <dialog
      ref={ref}
      aria-label={entry?.title ?? 'Lesson'}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className={styles.dialog}
    >
      <div className={styles.head}>
        <h2 className={styles.title}>{entry?.title ?? 'Lesson'}</h2>
        <button type="button" className={clsx(buttons.button, buttons.quiet, buttons.icon)} onClick={onClose} aria-label="Close" title="Close">
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      {Lesson ? (
        <Suspense fallback={<p>Loading lesson</p>}>
          <Lesson />
        </Suspense>
      ) : (
        <p>This lesson is not available</p>
      )}
    </dialog>
  )
}
