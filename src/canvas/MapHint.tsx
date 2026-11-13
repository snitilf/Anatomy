import { useEffect, useState } from 'react'
import styles from './MapHint.module.css'

const KEY = 'anatomy:map-hint-seen'

function seen(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== null
  } catch {
    return false
  }
}

function remember() {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    // Without storage the hint shows again next time. Nothing else depends on it.
  }
}

/** Tells a first-time visitor that cards move and that a card's edge dot draws a link. Gone for good after the first use. */
export function MapHint() {
  const [open, setOpen] = useState(() => !seen())

  useEffect(() => {
    if (!open) return
    const done = () => {
      remember()
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') done()
    }
    window.addEventListener('pointerdown', done, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', done, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  if (!open) return null
  return (
    <div className={styles.hint} role="note">
      <span>Drag a card to move it. Drag from its edge dot to draw a link.</span>
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss hint"
        onClick={() => {
          remember()
          setOpen(false)
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </div>
  )
}
