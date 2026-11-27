import clsx from 'clsx'
import { BookOpen } from 'lucide-react'
import { EXAMPLES, openExample } from './examples'
import rows from './rows.module.css'
import styles from './ExamplesMenu.module.css'
import { useWorkspace } from './workspaceContext'

/** The built-in example boards, as a list of buttons. */
export function ExampleList({ onChosen }: { onChosen?: () => void }) {
  const { openText } = useWorkspace()
  return (
    <ul className={styles.plain}>
      {EXAMPLES.map((example) => (
        <li key={example.id}>
          <button
            type="button"
            className={clsx(rows.row, styles.item)}
            onClick={() => {
              onChosen?.()
              void openExample(example, (fileName, text) => openText(fileName, text, 'example'))
            }}
          >
            <BookOpen className={rows.icon} size={14} strokeWidth={1.5} aria-hidden="true" />
            <span className={styles.itemTitle}>{example.title}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
