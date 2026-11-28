import clsx from 'clsx'
import { FileClock, FileWarning } from 'lucide-react'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { loadRevisionFields } from '../inspector/loadRevisionFields'
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
 * The quiet notice for a board.json that could not be opened, which left the open board as it was. On the map it floats with the
 * other notices. The Overview shows it in its own page, above the title, so it never covers the title or the goal.
 */
export function BoardProblem({ className }: { className?: string | undefined }) {
  const dispatch = useAppDispatch()
  const { board, problem } = useAppStore(useShallow((s) => ({ board: s.board, problem: s.boardProblem })))
  if (!board || !problem) return null
  const why = problemWords(problem, board.revision)
  return (
    <section className={clsx(styles.banner, className)} role="status" aria-label="Board file problem">
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
  )
}

/**
 * What the agent's latest file did, kept at the top of the map until the user acts: the revision that arrived, with a way
 * into the review, or a file that could not be opened. The Overview says the first in Needs you and shows the second in its own
 * page, so neither floats over it. The Review tab says the first too, so opening that tab takes the banner away.
 */
export function RevisionBanner() {
  const dispatch = useAppDispatch()
  const ui = useUiApi()
  const onMap = useUi((u) => u.view) === 'map'
  const reviewing = useUi((u) => u.tab === 'review' && u.sidebar.open)
  const { board, notice } = useAppStore(useShallow((s) => ({ board: s.board, notice: s.revisionNotice })))
  // The tab opens with the same sentence, so the banner would repeat it.
  const repeated = reviewing && notice !== undefined
  useEffect(() => {
    if (repeated) dispatch({ type: 'revisionNoticeDismissed' })
  }, [repeated, notice, dispatch])
  // The first changed part the user opens then has its words ready.
  useEffect(() => {
    if (notice) void loadRevisionFields()
  }, [notice])
  if (!board) return null
  const line = onMap && notice && !repeated ? summaryLine(notice) : undefined
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
      {onMap && <BoardProblem />}
    </>
  )
}
