import { useEffect } from 'react'
import { LessonDialog } from '../lessons/LessonDialog'
import { useAppStore } from './store'
import { useUi, useUiApi } from './ui'

/**
 * A row that opens this part's lesson and can take focus now: it is drawn, no inert page covers it, and it is not in the phone sheet
 * at its lowest stop, where everything but the header is below the screen. A row below the fold of a scrolling panel is fine: focus scrolls to it.
 */
function visibleOpener(part: string): HTMLElement | undefined {
  const rows = [...document.querySelectorAll<HTMLElement>('[data-lesson-opener]')].filter((el) => el.dataset.lessonOpener === part)
  return rows.find((el) => !el.closest('[inert], [data-stop="0"]') && el.getClientRects().length > 0)
}

/**
 * The one place a lesson dialog is drawn. The open lesson lives in the UI state, so the sidebar turning into the phone sheet,
 * or the page changing, does not close it or start its run again.
 * When it closes, focus goes back to the row that opened it as that row stands now, or to the panel if that row is gone.
 */
export function LessonHost() {
  const ui = useUiApi()
  const lesson = useUi((u) => u.lesson)
  const boardId = useAppStore((s) => s.board?.id)

  // A lesson belongs to the board it was opened on.
  useEffect(() => {
    ui.closeLesson()
  }, [boardId, ui])

  if (!lesson) return null
  const { id, opener } = lesson
  return (
    <LessonDialog
      key={id}
      lessonId={id}
      onClose={() => {
        ui.closeLesson()
        requestAnimationFrame(() => {
          const target = visibleOpener(opener) ?? document.querySelector<HTMLElement>('[data-testid="inspector"] h2, [data-testid="inspector"] button')
          target?.focus()
        })
      }}
    />
  )
}
