import { useEffect, useRef, useState } from 'react'
import buttons from './buttons.module.css'
import { EXAMPLES } from './examples'
import styles from './ExamplesMenu.module.css'
import { usePersistence } from './persistenceContext'

/** The built-in example boards, as a list of buttons. */
export function ExampleList({ onChosen }: { onChosen?: () => void }) {
  const { openText } = usePersistence()
  return (
    <ul className={styles.plain}>
      {EXAMPLES.map((example) => (
        <li key={example.id}>
          <button
            type="button"
            className={styles.item}
            onClick={() => {
              onChosen?.()
              openText(example.fileName, example.raw)
            }}
          >
            <span className={styles.itemTitle}>{example.title}</span>
            <span className={styles.itemText}>{example.description}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ExamplesMenu({ label, primary = false }: { label: string; primary?: boolean }) {
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
        <div className={styles.list} id="examples-list">
          <ExampleList onChosen={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
