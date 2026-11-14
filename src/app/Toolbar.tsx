import clsx from 'clsx'
import { CircleHelp, Download, Redo2, Undo2 } from 'lucide-react'
import { useAppDispatch, useAppStore } from './store'
import buttons from './buttons.module.css'
import { OpenMenu } from './OpenMenu'
import { useWorkspace } from './workspaceContext'
import { SaveStatus } from './SaveStatus'
import { SettingsMenu } from './SettingsMenu'
import styles from './Toolbar.module.css'

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const UNDO_KEYS = mac ? 'Cmd+Z' : 'Ctrl+Z'
const REDO_KEYS = mac ? 'Cmd+Shift+Z' : 'Ctrl+Y'

function UndoRedo() {
  const dispatch = useAppDispatch()
  const canUndo = useAppStore((s) => s.history.past.length > 0)
  const canRedo = useAppStore((s) => s.history.future.length > 0)
  const icon = clsx(buttons.button, buttons.quiet, buttons.icon)
  return (
    <>
      <button type="button" className={icon} onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo} aria-label="Undo" title={`Undo (${UNDO_KEYS})`}>
        <Undo2 size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button type="button" className={icon} onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo} aria-label="Redo" title={`Redo (${REDO_KEYS})`}>
        <Redo2 size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </>
  )
}

export function Toolbar({ onOpen, onHowTo }: { onOpen: () => void; onHowTo: () => void }) {
  const title = useAppStore((s) => s.board?.title)
  const { exportNow, save, folder } = useWorkspace()
  return (
    <header className={styles.bar}>
      <h1 className={styles.wordmark}>Anatomy</h1>
      {title !== undefined && (
        <p className={styles.title} title={folder?.state === 'open' ? `${folder.name}: ${title}` : title}>
          {title}
        </p>
      )}
      <div className={styles.status}>
        <SaveStatus />
      </div>
      <div className={styles.actions}>
        {title !== undefined && <UndoRedo />}
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
