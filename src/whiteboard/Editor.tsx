import { ViewportPortal } from '@xyflow/react'
import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { CARD_SIZE } from '../layout/cards'
import type { Size } from '../layout/geometry'
import { LAYER_LIMITS } from '../layer/model'
import cards from '../canvas/CardNode.module.css'
import { YoursEdge } from '../canvas/YoursEdge'
import { STICKY_SIZE } from './sizes'
import type { Editing } from './tools'
import styles from './Editor.module.css'

/** Room added to the measured width of text, so rounding never wraps its last word. */
const TEXT_SLACK = 2

export interface Typed {
  text: string
  label: string
  summary: string
  /** The size the words took, for text. */
  size?: Size
}

/**
 * Types on the map, in place: a text, a sticky note, or a part. It sits in board coordinates, so it zooms with the map.
 * Leaving it, Escape, or Cmd or Ctrl and Enter, hands back what was typed. The caller decides whether it is kept.
 */
export function Editor({
  editing,
  initial,
  size,
  onDone,
}: {
  editing: Editing
  initial: { text?: string; label?: string; summary?: string }
  size?: Size | undefined
  onDone: (typed: Typed) => void
}) {
  const [text, setText] = useState(initial.text ?? '')
  const [label, setLabel] = useState(initial.label ?? '')
  const [summary, setSummary] = useState(initial.summary ?? '')
  const root = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const done = useRef(false)

  useLayoutEffect(() => {
    const el = first.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.select()
  }, [])

  const finish = () => {
    if (done.current) return
    done.current = true
    const el = first.current
    onDone({ text, label, summary, ...(editing.kind === 'text' && el ? { size: { width: Math.ceil(el.offsetWidth) + TEXT_SLACK, height: Math.ceil(el.offsetHeight) } } : {}) })
  }
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (root.current?.contains(event.relatedTarget as Node | null)) return
    finish()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys typed here are the field's own. None of them reach the map or the commands.
    event.stopPropagation()
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
      event.preventDefault()
      finish()
    }
  }

  const box = size ?? (editing.kind === 'sticky' ? STICKY_SIZE : editing.kind === 'part' ? CARD_SIZE : undefined)
  return (
    <ViewportPortal>
      <div
        ref={root}
        className={`${styles.editor} nopan nodrag nowheel`}
        data-kind={editing.kind}
        style={{ transform: `translate(${editing.x}px, ${editing.y}px)`, ...(box ? { width: box.width, height: box.height } : {}) }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {editing.kind === 'part' ? (
          <>
            <div className={cards.card} data-yours="">
              <input
                ref={first}
                className={styles.label}
                name="part-name"
                aria-label="Name"
                placeholder="Name"
                value={label}
                maxLength={LAYER_LIMITS.partLabel}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault()
                    root.current?.querySelector('textarea')?.focus()
                  }
                }}
              />
              <textarea className={styles.summary} name="part-summary" aria-label="Summary" placeholder="Summary" value={summary} maxLength={LAYER_LIMITS.partSummary} onChange={(e) => setSummary(e.target.value)} />
            </div>
            <YoursEdge selected />
          </>
        ) : (
          <textarea
            ref={first}
            className={editing.kind === 'text' ? styles.text : styles.sticky}
            name="mark-text"
            aria-label={editing.kind === 'text' ? 'Text' : 'Sticky note'}
            placeholder={editing.kind === 'text' ? 'Text' : undefined}
            value={text}
            maxLength={LAYER_LIMITS.markText}
            rows={1}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </div>
    </ViewportPortal>
  )
}
