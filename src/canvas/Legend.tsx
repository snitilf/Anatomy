import { Popover } from '@base-ui/react/popover'
import { KeyRound } from 'lucide-react'
import { Tip } from '../app/Tip'
import { SOURCE_LABEL } from '../app/labels'
import { useUi, useUiApi } from '../app/ui'
import { MANUAL_STYLE, LINE_INK, YOURS_DASH } from './kinds'
import { lineKeyRows } from './lineKey'
import styles from './Legend.module.css'

/** The rows are the same until a style changes, so they are worked out once. */
const ROWS = lineKeyRows()

/** What each kind of line and each card edge means, the agent's first and the user's own after them, behind a small button next to the zoom bar. */
export function LineKey() {
  const open = useUi((u) => u.lineKeyOpen)
  const ui = useUiApi()
  return (
    <Popover.Root open={open} onOpenChange={ui.setLineKeyOpen}>
      <Tip label="Line key" side="top">
        <Popover.Trigger className={styles.button} aria-label="Line key">
          <KeyRound size={16} strokeWidth={1.5} aria-hidden="true" />
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} side="top" align="start" sideOffset={6} collisionPadding={8}>
          <Popover.Popup className={styles.list} aria-label="Line key" data-dismissible>
            <ul className={styles.rows}>
              {ROWS.map(({ kinds, style: s, label, words }) => (
                <li key={kinds.join('|')} className={styles.row} title={words}>
                  <svg width="32" height="12" viewBox="0 0 32 12" aria-hidden="true">
                    <line
                      x1="2"
                      y1="6"
                      x2="30"
                      y2="6"
                      stroke={LINE_INK}
                      strokeWidth={s.width}
                      strokeDasharray={s.dash || undefined}
                      strokeLinecap={s.dash.startsWith('1.5') ? 'round' : 'butt'}
                    />
                  </svg>
                  <span>{label}</span>
                </li>
              ))}
              <li className={styles.row}>
                <svg width="32" height="12" viewBox="0 0 32 12" aria-hidden="true">
                  <rect className={styles.proposal} x="6.5" y="0.5" width="19" height="11" rx="1.5" />
                </svg>
                <span>{SOURCE_LABEL['agent-proposal']}</span>
              </li>
            </ul>
            {/* What the user added, apart from what the agent drew: their links and their parts share one dash and dot. */}
            <ul className={styles.rows} data-yours="">
              <li className={styles.row}>
                <svg width="32" height="12" viewBox="0 0 32 12" aria-hidden="true">
                  <line x1="2" y1="6" x2="30" y2="6" stroke="var(--yours)" strokeWidth={MANUAL_STYLE.width} strokeDasharray={YOURS_DASH} strokeLinecap="round" />
                </svg>
                <span>Your link</span>
              </li>
              <li className={styles.row}>
                <svg width="32" height="12" viewBox="0 0 32 12" aria-hidden="true">
                  {/* Four whole rounds of the dash and dot, started so that every dot falls on a straight side and shows at 1x. */}
                  <rect className={styles.yours} x="6.355" y="0.5" width="19.29" height="11" rx="1.5" strokeDasharray={YOURS_DASH} strokeDashoffset="2.6" />
                </svg>
                <span>Your new part</span>
              </li>
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
