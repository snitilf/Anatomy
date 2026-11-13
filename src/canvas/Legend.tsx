import { useEffect, useId, useRef, useState } from 'react'
import { KIND_ORDER, KIND_WORDS } from '../app/labels'
import { KIND_STYLE, MANUAL_STYLE, TONE_COLOR } from './kinds'
import styles from './Legend.module.css'

const SHORT: Record<(typeof KIND_ORDER)[number], string> = {
  calls: 'Calls',
  triggers: 'Triggers',
  'sends-data-to': 'Sends data to',
  'stores-in': 'Stores data in',
  'reads-from': 'Reads data from',
  'depends-on': 'Depends on',
  unknown: 'Not known',
}

export function Legend() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  return (
    <div
      ref={root}
      className={styles.legend}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          button.current?.focus()
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Line key"
        onClick={() => setOpen((v) => !v)}
      >
        <svg className={styles.icon} width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M2 5h14" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <path d="M2 9h14" stroke="currentColor" strokeWidth="1.6" strokeDasharray="4 3" fill="none" />
          <path d="M2 13h14" stroke="currentColor" strokeWidth="1.8" strokeDasharray="1.5 3" strokeLinecap="round" fill="none" />
        </svg>
        <span className={styles.text}>Line key</span>
      </button>
      {open && (
        <ul id={listId} className={styles.list}>
          {KIND_ORDER.map((kind) => {
            const s = KIND_STYLE[kind]
            return (
              <li key={kind} className={styles.row} title={KIND_WORDS[kind]}>
                <svg width="36" height="10" viewBox="0 0 36 10" aria-hidden="true">
                  <line
                    x1="2"
                    y1="5"
                    x2="34"
                    y2="5"
                    stroke={TONE_COLOR[s.tone]}
                    strokeWidth={s.width}
                    strokeDasharray={s.dash || undefined}
                    strokeLinecap={s.dash.startsWith('1.5') ? 'round' : 'butt'}
                  />
                </svg>
                <span>{SHORT[kind]}</span>
              </li>
            )
          })}
          <li className={styles.row} title="An arrow you drew.">
            <svg width="36" height="10" viewBox="0 0 36 10" aria-hidden="true">
              <line x1="2" y1="5" x2="34" y2="5" stroke="var(--ink)" strokeWidth={MANUAL_STYLE.width} strokeDasharray={MANUAL_STYLE.dash} strokeLinecap="round" />
            </svg>
            <span>Your link</span>
          </li>
        </ul>
      )}
    </div>
  )
}
