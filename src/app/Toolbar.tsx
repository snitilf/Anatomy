import { useAppState } from './appContext'
import buttons from './buttons.module.css'
import { ExamplesMenu } from './ExamplesMenu'
import styles from './Toolbar.module.css'

export function Toolbar({ onOpen, onHowTo }: { onOpen: () => void; onHowTo: () => void }) {
  const { board } = useAppState()
  return (
    <header className={styles.bar}>
      <h1 className={styles.wordmark}>Anatomy</h1>
      {board && (
        <p className={styles.title} title={board.title}>
          {board.title}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={buttons.button} onClick={onOpen}>
          Open board
        </button>
        <ExamplesMenu label="Examples" />
        <button type="button" className={`${buttons.button} ${buttons.quiet}`} onClick={onHowTo}>
          How to make a board
        </button>
      </div>
    </header>
  )
}
