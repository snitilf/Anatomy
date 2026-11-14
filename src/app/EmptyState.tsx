import clsx from 'clsx'
import { useCommand } from '../commands/context'
import buttons from './buttons.module.css'
import { ExampleList } from './ExamplesMenu'
import styles from './EmptyState.module.css'
import { SavedBoardList } from './SavedBoards'
import { useWorkspace } from './workspaceContext'

/** The first line, an optional second line, and the actions, which depend on the folder and the browser. */
function Lead() {
  const { folder, canOpenFolder, openFolder, reopenFolder } = useWorkspace()
  const openFile = useCommand('open.file')
  const copyPrompt = useCommand('copy.prompt')
  const howTo = useCommand('howto')
  const primary = clsx(buttons.button, buttons.primary)

  if (folder?.state === 'missing') {
    return (
      <>
        <h2 className={styles.line}>{folder.name} has no board yet.</h2>
        <p className={styles.hint}>It opens here when your agent writes .anatomy/board.json.</p>
        <div className={styles.actions}>
          <button type="button" className={primary} onClick={copyPrompt.run}>
            Copy prompt
          </button>
          <button type="button" className={buttons.button} onClick={howTo.run}>
            How to make a board
          </button>
        </div>
      </>
    )
  }
  const fileButton = (main: boolean) => (
    <button type="button" className={main ? primary : buttons.button} onClick={openFile.run}>
      Open file
    </button>
  )
  return (
    <>
      <h2 className={styles.line}>Open a repository to see its anatomy.</h2>
      {!canOpenFolder && <p className={styles.hint}>This browser cannot open folders. Chrome and Edge can.</p>}
      <div className={styles.actions}>
        {canOpenFolder && folder?.state === 'reopen' && (
          <>
            <button type="button" className={primary} onClick={reopenFolder}>
              Reopen {folder.name}
            </button>
            <button type="button" className={buttons.button} onClick={openFolder}>
              Open another folder
            </button>
          </>
        )}
        {canOpenFolder && folder?.state !== 'reopen' && (
          <button type="button" className={primary} onClick={openFolder}>
            Open folder
          </button>
        )}
        {fileButton(!canOpenFolder)}
      </div>
    </>
  )
}

export function EmptyState() {
  const { saved, unavailable } = useWorkspace()
  return (
    <div className={styles.empty}>
      <div className={styles.column}>
        <Lead />
        {unavailable && (
          <p className={styles.problem} role="status">
            This browser blocks storage here, so nothing is saved. Download a copy to keep your work.
          </p>
        )}
        {saved.length > 0 && (
          <section className={styles.list} aria-labelledby="recent-title">
            <h3 className={styles.listTitle} id="recent-title">
              Recent
            </h3>
            <SavedBoardList />
          </section>
        )}
        <section className={styles.list} aria-labelledby="examples-title">
          <h3 className={styles.listTitle} id="examples-title">
            Examples
          </h3>
          <ExampleList />
        </section>
      </div>
    </div>
  )
}
