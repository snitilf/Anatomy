import clsx from 'clsx'
import buttons from './buttons.module.css'
import { Modal } from './Modal'
import styles from './Modal.module.css'
import { useWorkspace } from './workspaceContext'

/** The two questions the app can ask before it changes saved work. */
export function Dialogs() {
  const { deleting, choice, askDelete, confirmDelete, resolveChoice } = useWorkspace()
  return (
    <>
      {deleting && (
        <Modal title={`Delete ${deleting.title}?`} onCancel={() => askDelete(undefined)}>
          <p className={styles.text}>
            Removes the board and your notes from this browser.
          </p>
          <div className={styles.actions}>
            <button type="button" className={buttons.button} onClick={() => askDelete(undefined)}>
              Cancel
            </button>
            <button type="button" className={clsx(buttons.button, styles.danger)} onClick={confirmDelete}>
              Delete board
            </button>
          </div>
        </Modal>
      )}
      {choice && (
        <Modal title={`Notes and layout for ${choice.title}`} onCancel={() => resolveChoice(undefined)}>
          <p className={styles.text}>
            The file and this browser have different notes and layout. Which should the board use?
          </p>
          <div className={styles.actions}>
            <button type="button" className={buttons.button} onClick={() => resolveChoice(undefined)}>
              Cancel
            </button>
            <button type="button" className={buttons.button} onClick={() => resolveChoice('browser')}>
              Use browser notes and layout
            </button>
            <button type="button" className={clsx(buttons.button, buttons.primary)} onClick={() => resolveChoice('file')}>
              Use file notes and layout
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
