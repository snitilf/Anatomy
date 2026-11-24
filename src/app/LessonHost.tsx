import { useEffect, useRef } from 'react'
import { LessonDialog } from '../lessons/LessonDialog'
import { returnFocus } from './lessonFocus'
import { useAppStore } from './store'
import { useUi, useUiApi } from './ui'

/**
 * The one place a lesson dialog is drawn. The open lesson lives in the UI state, so the sidebar turning into the phone sheet,
 * or the page changing, does not close it or start its run again.
 * It stays open while the current board still has the part that opened it, with that lesson.
 * When it closes, focus goes back to the row that opened it as that row stands now, or to the best place that can take it.
 */
export function LessonHost() {
  const ui = useUiApi()
  const lesson = useUi((u) => u.lesson)
  const boardId = useAppStore((s) => s.board?.id)
  const valid = useAppStore((s) => (lesson ? (s.board?.components.some((c) => c.id === lesson.opener && c.lesson === lesson.id) ?? false) : true))

  // A lesson belongs to the board it was opened on, and to the part that holds it in this revision of that board.
  const lastBoard = useRef(boardId)
  useEffect(() => {
    const switched = lastBoard.current !== boardId
    lastBoard.current = boardId
    if (!lesson || (valid && !switched)) return
    const part = lesson.opener
    ui.closeLesson()
    // The dialog goes with it, and focus with the dialog, unless something else took it already.
    requestAnimationFrame(() => returnFocus(part, true))
  }, [lesson, valid, boardId, ui])

  if (!lesson || !valid) return null
  const { id, opener } = lesson
  return (
    <LessonDialog
      key={id}
      lessonId={id}
      onClose={() => {
        ui.closeLesson()
        requestAnimationFrame(() => returnFocus(opener))
      }}
    />
  )
}
