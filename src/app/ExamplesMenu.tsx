import { useEffect, useRef, useState } from 'react'
import { useAppDispatch } from './appContext'
import buttons from './buttons.module.css'
import { EXAMPLES } from './examples'
import styles from './ExamplesMenu.module.css'
import { openFromText } from './openFile'

export function ExamplesMenu({ label, primary = false }: { label: string; primary?: boolean }) {
  const dispatch = useAppDispatch()
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
        className={`${buttons.button} ${primary ? buttons.primary : ''}`}
        aria-expanded={open}
        aria-controls="examples-list"
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span aria-hidden="true" className={styles.caret} />
      </button>
      {open && (
        <ul className={styles.list} id="examples-list">
          {EXAMPLES.map((example) => (
            <li key={example.id}>
              <button
                type="button"
                className={styles.item}
                onClick={() => {
                  setOpen(false)
                  dispatch(openFromText(example.fileName, example.raw))
                }}
              >
                <span className={styles.itemTitle}>{example.title}</span>
                <span className={styles.itemText}>{example.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
