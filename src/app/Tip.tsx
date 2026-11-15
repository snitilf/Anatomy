import { Tooltip } from '@base-ui/react/tooltip'
import { useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import styles from './Tip.module.css'

/** After a popup closes, focus goes back to its button. That focus does not open the tooltip. */
const FOCUS_RETURN_MS = 500

/**
 * A short hint for a control, with its shortcut. The control keeps its own accessible name.
 * The first tooltip waits 400 ms (set on the provider); the next ones open at once while one is open.
 */
export function Tip({
  label,
  keys,
  side = 'bottom',
  holdWhile = false,
  children,
}: {
  label: string
  keys?: string | undefined
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** True while a popup from this control is open. The tooltip stays shut then, and does not open again when focus comes back. */
  holdWhile?: boolean
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  const quietUntil = useRef(0)
  const held = useRef(holdWhile)
  // While the popup is open the tooltip is shut.
  if (holdWhile && open) setOpen(false)
  useLayoutEffect(() => {
    if (held.current && !holdWhile) quietUntil.current = performance.now() + FOCUS_RETURN_MS
    held.current = holdWhile
  }, [holdWhile])
  return (
    <Tooltip.Root
      open={open}
      onOpenChange={(next, details) => {
        if (next && (holdWhile || (details.reason === 'trigger-focus' && performance.now() < quietUntil.current))) return
        setOpen(next)
      }}
    >
      <Tooltip.Trigger render={children} />
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
