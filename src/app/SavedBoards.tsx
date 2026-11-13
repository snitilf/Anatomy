import { useEffect, useRef, useState } from 'react'
import { NAMESPACES, type BoardSummary } from '../persistence/store'
import buttons from './buttons.module.css'
import menu from './ExamplesMenu.module.css'
import { useAppState } from './appContext'
import { usePersistence } from './persistenceContext'
import styles from './SavedBoards.module.css'

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function savedOn(board: BoardSummary): string {
  const date = new Date(board.savedAt)
  return Number.isNaN(date.getTime()) ? 'Saved' : `Saved ${DATE.format(date)}`
}

/** Boards saved in this space, each with Open and Delete. */
export function SavedBoardList({ onChosen }: { onChosen?: () => void }) {
  const { saved, openSaved, askDelete } = usePersistence()
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
              className={`${buttons.button} ${styles.small}`}
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
              className={`${buttons.button} ${buttons.quiet} ${styles.small}`}
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

/** The toolbar menu. It appears only when this space has saved boards. */
export function SavedBoardsMenu() {
  const { saved, space } = usePersistence()
  const { board } = useAppState()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  // With no board open, the start screen lists the saved boards itself.
  if (!board || saved.length === 0) return null
  return (
    <div
      className={styles.root}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={buttons.button}
        aria-expanded={open}
        aria-controls="saved-boards"
        onClick={() => setOpen((v) => !v)}
      >
        Saved boards
        <span aria-hidden="true" className={menu.caret} />
      </button>
      {open && (
        <div className={styles.panel} id="saved-boards">
          <p className={styles.heading}>Saved in this browser, {NAMESPACES[space]}</p>
          <SavedBoardList onChosen={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
