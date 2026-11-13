import clsx from 'clsx'
import { useAppStore } from './store'
import buttons from './buttons.module.css'
import { OpenMenu } from './OpenMenu'
import { usePersistence } from './persistenceContext'
import { SaveStatus } from './SaveStatus'
import { SpaceSwitch } from './SpaceSwitch'
import styles from './Toolbar.module.css'

export function Toolbar({ onOpen, onHowTo }: { onOpen: () => void; onHowTo: () => void }) {
  const title = useAppStore((s) => s.board?.title)
  const { exportNow, save } = usePersistence()
  return (
    <header className={styles.bar}>
      <h1 className={styles.wordmark}>Anatomy</h1>
      {title !== undefined && (
        <p className={styles.title} title={title}>
          {title}
        </p>
      )}
      <div className={styles.status}>
        <SaveStatus />
        <SpaceSwitch />
      </div>
      <div className={styles.actions}>
        <OpenMenu onOpenFile={onOpen} />
        {/* While saving fails, the status shows Export beside the reason. */}
        {title !== undefined && save.kind !== 'error' && (
          <button type="button" className={buttons.button} onClick={exportNow} title="Download the board with your notes">
            Export
          </button>
        )}
        <button type="button" className={clsx(buttons.button, buttons.quiet)} onClick={onHowTo}>
          How to make a board
        </button>
      </div>
    </header>
  )
}
