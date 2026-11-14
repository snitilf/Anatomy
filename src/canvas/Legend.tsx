import { Popover } from '@base-ui/react/popover'
import { CircleHelp } from 'lucide-react'
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

/** What each kind of line means, behind a small button next to the zoom bar. */
export function LineKey() {
  return (
    <Popover.Root>
      <Popover.Trigger className={styles.button} aria-label="Line key" title="Line key">
        <CircleHelp size={16} strokeWidth={1.5} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} side="top" align="start" sideOffset={6} collisionPadding={8}>
          <Popover.Popup className={styles.list} aria-label="Line key" data-dismissible>
            <ul className={styles.rows}>
            {KIND_ORDER.map((kind) => {
              const s = KIND_STYLE[kind]
              return (
                <li key={kind} className={styles.row} title={KIND_WORDS[kind]}>
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
                  <span>{SHORT[kind]}</span>
                </li>
              )
            })}
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
