import { Menu } from '@base-ui/react/menu'
import clsx from 'clsx'
import buttons from './buttons.module.css'
import { EXAMPLES } from './examples'
import styles from './ExamplesMenu.module.css'
import { usePersistence } from './persistenceContext'

/** The built-in example boards, as a list of buttons. */
export function ExampleList({ onChosen }: { onChosen?: () => void }) {
  const { openText } = usePersistence()
  return (
    <ul className={styles.plain}>
      {EXAMPLES.map((example) => (
        <li key={example.id}>
          <button
            type="button"
            className={styles.item}
            onClick={() => {
              onChosen?.()
              openText(example.fileName, example.raw)
            }}
          >
            <span className={styles.itemTitle}>{example.title}</span>
            <span className={styles.itemText}>{example.description}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * The start screen's list of examples. Every choice is one action, so it is a real menu:
 * the arrow keys move between examples, Enter opens one, and Escape closes the menu and returns focus to the trigger.
 */
export function ExamplesMenu({ label, primary = false }: { label: string; primary?: boolean }) {
  const { openText } = usePersistence()
  return (
    <Menu.Root>
      <Menu.Trigger className={clsx(buttons.button, primary && buttons.primary)}>
        {label}
        <span aria-hidden="true" className={styles.caret} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className={styles.positioner} side="bottom" align="start" sideOffset={6} collisionPadding={12}>
          <Menu.Popup className={styles.list} data-dismissible>
            {EXAMPLES.map((example) => (
              <Menu.Item key={example.id} className={styles.item} onClick={() => openText(example.fileName, example.raw)}>
                <span className={styles.itemTitle}>{example.title}</span>
                <span className={styles.itemText}>{example.description}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
