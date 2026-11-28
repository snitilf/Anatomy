import { useId, type ReactNode } from 'react'
import { STATE_WORD, type ItemState } from './state'
import styles from './StatusGlyph.module.css'

/** The inside of each glyph. All share one 14px circle, drawn with a 1.5px line. */
function Body({ state, id }: { state: ItemState; id: string }): ReactNode {
  switch (state) {
    case 'unsent':
      return <circle cx="7" cy="7" r="5.5" strokeDasharray="2.16 2.16" strokeDashoffset="1.08" />
    case 'sent':
      return (
        <>
          <circle cx="7" cy="7" r="5.5" />
          <path d="M7 3.4a3.6 3.6 0 0 1 0 7.2z" fill="currentColor" stroke="none" />
        </>
      )
    case 'answered':
      return (
        <>
          <circle cx="7" cy="7" r="5.5" />
          <path d="M6.2 4.9 4.3 6.8l1.9 1.9M4.5 6.8h3.1a1.6 1.6 0 0 1 1.6 1.6v.4" />
        </>
      )
    case 'kept':
      return (
        <>
          <circle cx="7" cy="7" r="5.5" />
          <path d="m4.6 7.1 1.7 1.7 3.1-3.4" />
        </>
      )
    case 'adopted':
      return (
        <>
          <mask id={id}>
            <rect width="14" height="14" fill="white" />
            <path d="m4.4 7.2 1.9 1.9 3.4-3.7" fill="none" stroke="black" strokeWidth="1.5" />
          </mask>
          <circle cx="7" cy="7" r="6.25" fill="currentColor" stroke="none" mask={`url(#${id})`} />
        </>
      )
    case 'declined':
      return (
        <>
          <circle cx="7" cy="7" r="5.5" />
          <path d="m5 5 4 4M9 5 5 9" />
        </>
      )
    case 'outdated':
      return (
        <>
          <circle cx="7" cy="7" r="5.5" />
          <path d="M7 4.1V7l1.9 1.2" />
        </>
      )
    case 'relinking':
      return (
        <>
          <path d="M7 1.5A5.5 5.5 0 0 1 12.2 5.2M12.5 8.4A5.5 5.5 0 0 1 8.8 12.3M5.4 12.2A5.5 5.5 0 0 1 1.5 7.6M1.8 5.5A5.5 5.5 0 0 1 5.2 1.9" />
          <path d="M5.2 8.8 8.8 5.2" />
        </>
      )
  }
}

/**
 * The glyph of an item's state, on a 14px circle. It has an accessible name, the state word, unless a visible word sits
 * beside it (`withWord`), in which case it is hidden from assistive technology so the word is not read twice.
 * `data-state` carries the state, for styles and tests.
 */
export function StatusGlyph({ state, size = 14, withWord = false }: { state: ItemState; size?: number; withWord?: boolean }) {
  const id = useId()
  return (
    <svg
      className={styles.glyph}
      data-state={state}
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(withWord ? { 'aria-hidden': true } : { role: 'img', 'aria-label': STATE_WORD[state] })}
    >
      <Body state={state} id={id} />
    </svg>
  )
}

/** The glyph and its word, the glyph first. */
export function StatusWord({ state, size = 14 }: { state: ItemState; size?: number }) {
  return (
    <span className={styles.word}>
      <StatusGlyph state={state} size={size} withWord />
      {STATE_WORD[state]}
    </span>
  )
}
