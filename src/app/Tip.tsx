import { Tooltip } from '@base-ui/react/tooltip'
import type { ReactElement } from 'react'
import styles from './Tip.module.css'

/**
 * A short hint for a control, with its shortcut. The control keeps its own accessible name.
 * The first tooltip waits 400 ms (set on the provider); the next ones open at once while one is open.
 */
export function Tip({ label, keys, side = 'bottom', children }: { label: string; keys?: string | undefined; side?: 'top' | 'bottom' | 'left' | 'right'; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner className={styles.positioner} side={side} sideOffset={6} collisionPadding={8}>
          <Tooltip.Popup className={styles.tip}>
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
