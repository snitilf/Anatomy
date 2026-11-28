import { Popover } from '@base-ui/react/popover'
import clsx from 'clsx'
import { KeyRound } from 'lucide-react'
import buttons from '../app/buttons.module.css'
import { StatusGlyph } from './StatusGlyph'
import { ITEM_STATES, STATE_MEANING, STATE_WORD } from './state'
import styles from './StatusKey.module.css'

/** A small button that opens the status glyphs, each with its word and what it means. */
export function StatusKey() {
  return (
    <Popover.Root>
      <Popover.Trigger className={clsx(buttons.button, buttons.quiet, buttons.small, styles.trigger)}>
        <KeyRound size={14} strokeWidth={1.5} aria-hidden="true" />
        Status key
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} side="left" align="end" sideOffset={6} collisionPadding={8}>
          <Popover.Popup className={styles.list} aria-label="Status key" data-dismissible>
            <ul className={styles.rows}>
              {ITEM_STATES.map((state) => (
                <li key={state} className={styles.row}>
                  <StatusGlyph state={state} withWord />
                  <span className={styles.word}>{STATE_WORD[state]}</span>
                  <span className={styles.meaning}>{STATE_MEANING[state]}</span>
                </li>
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
