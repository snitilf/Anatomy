import { useStore } from '@xyflow/react'
import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useState } from 'react'
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

/** Below this window width the hint would cover the map, so it is not shown. */
const NARROW_WINDOW = 760
/** The hint sits between the line key and the zoom buttons. A map narrower than this leaves no room between them. */
const ROOMY_MAP = 600

function narrowWindow(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(`(max-width: ${NARROW_WINDOW - 1}px)`).matches
}

/** Tells a first-time visitor that cards move and that a card's edge dot draws a link. Gone for good after the first use. */
export function MapHint({ mapWidth, onChange }: { mapWidth?: number; onChange?: () => void }) {
  const [open, setOpen] = useState(() => !seen())
  const storeWidth = useStore((s) => s.width)
  const width = mapWidth && mapWidth > 0 ? mapWidth : storeWidth
  // The hint is for a screen with room. On a phone it is never shown, so it is not used up either.
  const roomy = width >= ROOMY_MAP && !narrowWindow()
  const shown = open && roomy

  useLayoutEffect(() => {
    onChange?.()
  }, [shown, width, onChange])

  useEffect(() => {
    if (!open || !roomy) return
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
  }, [open, roomy])

  if (!open || !roomy) return null
  return (
    <div className={styles.hint} role="note">
      <span>Drag a card to move it, its edge dot to link. Scroll to zoom. Draw with the tools below.</span>
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss hint"
        onClick={() => {
          remember()
          setOpen(false)
        }}
      >
        <X size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  )
}
