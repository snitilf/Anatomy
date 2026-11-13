import { useEffect, useRef, useState } from 'react'
import { NAMESPACES } from '../persistence/store'
import { useAppState } from './appContext'
import buttons from './buttons.module.css'
import { ExampleList } from './ExamplesMenu'
import styles from './OpenMenu.module.css'
import { usePersistence } from './persistenceContext'
import { SavedBoardList } from './SavedBoards'

/**
 * One toolbar menu for every way to open a board: a file, a saved board, or an example.
 * The panel is a plain list of buttons after the trigger, so Tab walks through it.
 * Escape, a click outside, or Tab past the end closes it.
 */
export function OpenMenu({ onOpenFile }: { onOpenFile: () => void }) {
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

  // With no board open, the start screen has these choices itself.
  if (!board) return null
  const close = () => setOpen(false)
  return (
    <div
      className={styles.root}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          close()
          trigger.current?.focus()
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget
        if (open && next instanceof Node && !root.current?.contains(next)) close()
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={buttons.button}
        aria-expanded={open}
        aria-controls="open-menu"
        onClick={() => setOpen((v) => !v)}
      >
        Open
        <span aria-hidden="true" className={styles.caret} />
      </button>
      {open && (
        <div className={styles.panel} id="open-menu">
          <button
            type="button"
            className={styles.file}
            onClick={() => {
              close()
              onOpenFile()
            }}
          >
            Open a file
          </button>
          {saved.length > 0 && (
            <section className={styles.section} aria-labelledby="open-saved">
              <h2 className={styles.heading} id="open-saved">
                Saved in this browser, {NAMESPACES[space]}
              </h2>
              <SavedBoardList onChosen={close} />
            </section>
          )}
          <section className={styles.section} aria-labelledby="open-examples">
            <h2 className={styles.heading} id="open-examples">
              Examples
            </h2>
            <ExampleList onChosen={close} />
          </section>
        </div>
      )}
    </div>
  )
}
