/* oxlint-disable react/static-components -- the lazy components are created once per lesson id, at module scope */
import { Suspense, lazy, useEffect, useRef, type ComponentType, type LazyExoticComponent } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'
import buttons from '../app/buttons.module.css'
import { findLesson, type LessonEntry } from './catalog'
import styles from './LessonDialog.module.css'

// A lazy component created again on every open would suspend again, even with its chunk cached, and the dialog would flash a loading
// line and jump in height. One per lesson, made once, renders at once after its first load.
const lazies = new Map<string, LazyExoticComponent<ComponentType>>()

function lessonComponent(entry: LessonEntry) {
  let component = lazies.get(entry.id)
  if (!component) {
    component = lazy(entry.load)
    lazies.set(entry.id, component)
  }
  return component
}

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
