import { EXAMPLES, openExample } from './examples'
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
            className={styles.item}
            onClick={() => {
              onChosen?.()
              void openExample(example, (fileName, text) => openText(fileName, text, 'example'))
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
