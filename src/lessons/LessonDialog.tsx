/* oxlint-disable react/static-components -- the lazy component is memoized per lesson id */
import { Suspense, lazy, useEffect, useMemo, useRef } from 'react'
import { findLesson } from './catalog'

interface Props {
  lessonId: string
  onClose: () => void
}

/** A modal dialog that loads one built-in lesson. The caller returns focus to the opener. */
export function LessonDialog({ lessonId, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const entry = findLesson(lessonId)
  const Lesson = useMemo(() => (entry ? lazy(entry.load) : null), [entry])

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
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
      style={{
        width: 'min(960px, 100vw - 32px)',
        maxWidth: 'none',
        maxHeight: 'calc(100vh - 32px)',
        overflow: 'auto',
        padding: 16,
        border: '1px solid currentColor',
        borderRadius: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{entry?.title ?? 'Lesson'}</h2>
        <button type="button" onClick={onClose}>
          Close
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
