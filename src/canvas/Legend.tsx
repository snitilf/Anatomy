import { Popover } from '@base-ui/react/popover'
import { CircleHelp } from 'lucide-react'
import { Tip } from '../app/Tip'
import { useUi, useUiApi } from '../app/ui'
import { MANUAL_STYLE, TONE_COLOR } from './kinds'
import { lineKeyRows } from './lineKey'
import styles from './Legend.module.css'

/** The rows are the same until a style changes, so they are worked out once. */
const ROWS = lineKeyRows()

/** What each kind of line means, behind a small button next to the zoom bar. */
export function LineKey() {
  const open = useUi((u) => u.lineKeyOpen)
  const ui = useUiApi()
  return (
    <Popover.Root open={open} onOpenChange={ui.setLineKeyOpen}>
      <Tip label="Line key" side="top">
        <Popover.Trigger className={styles.button} aria-label="Line key">
          <CircleHelp size={16} strokeWidth={1.5} aria-hidden="true" />
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} side="top" align="start" sideOffset={6} collisionPadding={8}>
          <Popover.Popup className={styles.list} aria-label="Line key" data-dismissible>
            <ul className={styles.rows}>
              {ROWS.map(({ kinds, style: s, label, words }) => (
                <li key={kinds.join('|')} className={styles.row} title={words}>
                  <svg width="32" height="10" viewBox="0 0 32 10" aria-hidden="true">
                    <line
                      x1="2"
                      y1="5"
                      x2="30"
                      y2="5"
                      stroke={TONE_COLOR[s.tone]}
                      strokeWidth={s.width}
                      strokeDasharray={s.dash || undefined}
                      strokeLinecap={s.dash.startsWith('1.5') ? 'round' : 'butt'}
                    />
                  </svg>
                  <span>{label}</span>
                </li>
              ))}
              <li className={styles.row}>
                <svg width="32" height="10" viewBox="0 0 32 10" aria-hidden="true">
                  <line x1="2" y1="5" x2="30" y2="5" stroke="var(--yours)" strokeWidth={MANUAL_STYLE.width} strokeDasharray={MANUAL_STYLE.dash} strokeLinecap="round" />
                </svg>
                <span>Your link</span>
              </li>
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
