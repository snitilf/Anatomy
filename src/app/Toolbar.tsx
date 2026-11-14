import clsx from 'clsx'
import { CircleHelp, Download } from 'lucide-react'
import { useAppStore } from './store'
import buttons from './buttons.module.css'
import { OpenMenu } from './OpenMenu'
import { usePersistence } from './persistenceContext'
import { SaveStatus } from './SaveStatus'
import { SettingsMenu } from './SettingsMenu'
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
          <button type="button" className={buttons.button} onClick={exportNow}>
            <Download size={16} strokeWidth={1.5} aria-hidden="true" />
            Export
          </button>
        )}
        <button
          type="button"
          className={clsx(buttons.button, buttons.quiet, buttons.icon)}
          onClick={onHowTo}
          aria-label="How to make a board"
          title="How to make a board"
        >
          <CircleHelp size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <SettingsMenu />
      </div>
    </header>
  )
}
