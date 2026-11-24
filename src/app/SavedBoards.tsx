import clsx from 'clsx'
import type { BoardSummary } from '../workspace/db'
import buttons from './buttons.module.css'
import { useWorkspace } from './workspaceContext'
import styles from './SavedBoards.module.css'

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function savedOn(board: BoardSummary): string {
  const date = new Date(board.savedAt)
  return Number.isNaN(date.getTime()) ? 'Saved' : `Saved ${DATE.format(date)}`
}

/** Boards saved in this space, each with Open and Delete. */
export function SavedBoardList({ onChosen }: { onChosen?: () => void }) {
  const { saved, openSaved, askDelete } = useWorkspace()
  return (
    <ul className={styles.list}>
      {saved.map((board) => (
        <li key={board.id} className={styles.item}>
          <span className={styles.info}>
            <span className={styles.title}>{board.title}</span>
            <span className={styles.meta}>
              Revision {board.revision}, {savedOn(board)}
            </span>
          </span>
          <span className={styles.actions}>
            <button
              type="button"
              className={clsx(buttons.button, buttons.small)}
              aria-label={`Open ${board.title}`}
              onClick={() => {
                onChosen?.()
                openSaved(board.id)
              }}
            >
              Open
            </button>
            <button
              type="button"
              className={clsx(buttons.button, buttons.quiet, buttons.small)}
              aria-label={`Delete ${board.title}`}
              onClick={() => {
                onChosen?.()
                askDelete(board)
              }}
            >
              Delete
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}
