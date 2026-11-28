import clsx from 'clsx'
import { FileClock, FileWarning } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { summaryLine } from '../layer/revisionSummary'
import buttons from './buttons.module.css'
import styles from './RevisionBanner.module.css'
import { useAppDispatch, useAppStore } from './store'
import { useUi, useUiApi } from './ui'
import { showView } from './viewActions'
import type { BoardProblemNotice } from './state'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** One sentence for why the latest file was not opened, and the detail that lets the user pass it on. */
function problemWords(problem: BoardProblemNotice, open: number): { text: string; detail?: string } {
  if (problem.kind === 'invalid') return { text: `board.json has ${plural(problem.count, 'problem')}, so revision ${open} stays open.`, ...(problem.first ? { detail: problem.first } : {}) }
  if (problem.found === open) return { text: `board.json changed but is still revision ${open}. A new revision needs a higher number.` }
  return { text: `board.json is at revision ${problem.found}, lower than the open revision ${open}, so revision ${open} stays open.` }
}

/**
 * What the agent's latest file did, kept at the top of the map until the user acts: the revision that arrived, with a way
 * into the review, or a file that could not be opened and left the board as it was. The Overview says the first in Needs you,
 * so only the second shows there.
 */
export function RevisionBanner() {
  const dispatch = useAppDispatch()
  const ui = useUiApi()
  const onMap = useUi((u) => u.view) === 'map'
  const { board, notice, problem } = useAppStore(useShallow((s) => ({ board: s.board, notice: s.revisionNotice, problem: s.boardProblem })))
  if (!board) return null
  const line = onMap && notice ? summaryLine(notice) : undefined
  const why = problem && problemWords(problem, board.revision)
  return (
    <>
      {line && notice && (
        <section className={styles.banner} role="status" aria-label="Revision update">
          <FileClock className={styles.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
          <p className={styles.text}>{line}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={clsx(buttons.button, buttons.small)}
              onClick={() => {
                showView(ui, board.id, 'map')
                ui.setSidebarOpen(true)
                ui.setTab('review')
                dispatch({ type: 'revisionNoticeDismissed' })
              }}
            >
              Review
            </button>
            <button type="button" className={clsx(buttons.button, buttons.quiet, buttons.small)} onClick={() => dispatch({ type: 'revisionNoticeDismissed' })}>
              Dismiss
            </button>
          </div>
        </section>
      )}
      {why && (
        <section className={styles.banner} role="status" aria-label="Board file problem">
          <FileWarning className={styles.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
          <div className={styles.text}>
            <p className={styles.line}>{why.text}</p>
            {why.detail && <code className={styles.detail}>{why.detail}</code>}
          </div>
          <div className={styles.actions}>
            <button type="button" className={clsx(buttons.button, buttons.quiet, buttons.small)} onClick={() => dispatch({ type: 'boardProblem', problem: undefined })}>
              Dismiss
            </button>
          </div>
        </section>
      )}
    </>
  )
}
