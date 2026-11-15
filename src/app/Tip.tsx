import { Tooltip } from '@base-ui/react/tooltip'
import { useEffect, useState, type ReactElement } from 'react'
import styles from './Tip.module.css'

/**
 * A short hint for a control, with its shortcut. The control keeps its own accessible name.
 * The first tooltip waits 400 ms (set on the provider); the next ones open at once while one is open.
 */
export function Tip({
  label,
  keys,
  side = 'bottom',
  holdWhile = false,
  consumeReturnFocus,
  children,
}: {
  label: string
  keys?: string | undefined
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** True while a popup from this control is open. The tooltip stays shut then, and does not open again when focus comes back. */
  holdWhile?: boolean
  consumeReturnFocus?: () => boolean
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Tab') consumeReturnFocus?.()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [consumeReturnFocus])
  if (holdWhile && open) setOpen(false)
  return (
    <Tooltip.Root
      open={open}
      onOpenChange={(next, details) => {
        if (next && details.reason === 'trigger-focus' && consumeReturnFocus?.()) return
        if (next && holdWhile) return
        setOpen(next)
      }}
    >
      <Tooltip.Trigger
        render={children}
        onBlur={() => { consumeReturnFocus?.() }}
        onPointerDown={() => { consumeReturnFocus?.() }}
        onKeyDown={() => { consumeReturnFocus?.() }}
      />
      <Tooltip.Portal>
        <Tooltip.Positioner className={styles.positioner} side={side} sideOffset={6} collisionPadding={8}>
          <Tooltip.Popup className={styles.tip} role="tooltip">
            {label}
            {keys && <kbd className={styles.keys}>{keys}</kbd>}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function TipProvider({ children }: { children: ReactElement }) {
  return <Tooltip.Provider delay={400}>{children}</Tooltip.Provider>
}
